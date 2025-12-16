"""ES -> Postgres sync helpers.

Problem this fixes:
- The project is Django-based, but an older SQLAlchemy-based implementation lived here.
- Timestamp parsing didn't match ES payloads like `2025-12-16T12:00:00Z`.
- A background scheduler won't run unless explicitly started by Django.

Use `sync_es_alerts_to_db()` from a management command or an API endpoint.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from django.db import DatabaseError, IntegrityError, transaction

from .models import Alert, ESIntegrationConfig
from .services import _http_search

logger = logging.getLogger(__name__)


def _parse_es_timestamp(value: Any) -> Optional[datetime]:
    """Parse timestamps like `2025-12-16T12:00:00Z` (with/without fractions)."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if not isinstance(value, str):
        value = str(value)
    raw = value.strip()
    if raw.endswith('Z'):
        raw = raw[:-1] + '+00:00'
    try:
        dt = datetime.fromisoformat(raw)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def _coerce_int(value: Any) -> Optional[int]:
    if value is None or value == '':
        return None
    try:
        return int(value)
    except Exception:
        return None


def _get_env_es_config() -> Tuple[Optional[str], Optional[str], Optional[str], str]:
    host = os.getenv('ES_HOST')
    username = os.getenv('ES_USERNAME')
    password = os.getenv('ES_PASSWORD')
    index = os.getenv('ES_INDEX', 'alerts_test')
    return host, username, password, index


def _fetch_docs_from_es_via_env(tenant_id: Optional[str], size: int) -> List[Dict]:
    """Best-effort ES _search using env vars (dev/local fallback).

    Uses `requests` to get proper connect/read timeouts.
    """
    import requests

    host, username, password, index = _get_env_es_config()
    if not host:
        logger.warning('ES_HOST is not set; cannot fetch from ES')
        return []
    if not host.startswith('http'):
        host = 'http://' + host
    host = host.rstrip('/')

    url = f"{host}/{index}/_search"
    headers = {'Content-Type': 'application/json', 'Accept': 'application/json'}
    auth = (username, password) if username and password else None

    body: Dict[str, Any] = {'size': size, 'query': {'match_all': {}}}
    if tenant_id:
        body['query'] = {'match': {'tenant_id': tenant_id}}

    try:
        connect_timeout = float(os.getenv('ES_HTTP_CONNECT_TIMEOUT_SECONDS', '5'))
        read_timeout = float(os.getenv('ES_HTTP_READ_TIMEOUT_SECONDS', '30'))
        resp = requests.post(url, headers=headers, json=body, auth=auth, timeout=(connect_timeout, read_timeout))
        resp.raise_for_status()
        res = resp.json()
        return [h.get('_source', {}) for h in res.get('hits', {}).get('hits', [])]
    except requests.Timeout as e:
        logger.exception('ES timeout when fetching %s: %s', url, e)
    except requests.HTTPError as e:
        logger.exception('ES HTTPError when fetching %s: %s', url, e)
        try:
            logger.error('ES response body: %s', (e.response.text or '')[:2000])
        except Exception:
            pass
    except requests.RequestException as e:
        logger.exception('ES network error when fetching %s: %s', url, e)
    except Exception as e:
        logger.exception('ES unexpected error when fetching %s: %s', url, e)
    return []


def sync_es_alerts_to_db(
    *,
    tenant_id: Optional[str] = None,
    size: int = 100,
    force_config: bool = False,
) -> Dict[str, Any]:
    """Fetch alerts from ES and upsert them into `es_integration_alert`.

    Returns: {source, fetched, inserted, updated, skipped, errors}.
    """
    if size <= 0:
        size = 100

    # Multi-tenant mode:
    # - If tenant_id is provided: fetch only that tenant's alerts.
    # - If tenant_id is None: sync all enabled tenants (from ESIntegrationConfig),
    #   falling back to env-based fetch without tenant filter.
    if tenant_id is None:
        per_tenant: Dict[str, Any] = {}
        try:
            enabled_tenants = list(
                ESIntegrationConfig.objects.filter(enabled=True)
                .values_list('tenant_id', flat=True)
                .distinct()
            )
        except Exception:
            enabled_tenants = []

        if enabled_tenants:
            totals = {'fetched': 0, 'inserted': 0, 'updated': 0, 'skipped': 0, 'errors': []}
            for tid in enabled_tenants:
                r = sync_es_alerts_to_db(tenant_id=tid, size=size, force_config=force_config)
                per_tenant[tid] = r
                totals['fetched'] += int(r.get('fetched', 0) or 0)
                totals['inserted'] += int(r.get('inserted', 0) or 0)
                totals['updated'] += int(r.get('updated', 0) or 0)
                totals['skipped'] += int(r.get('skipped', 0) or 0)
                totals['errors'].extend(r.get('errors') or [])

            return {
                'source': 'multi-tenant(cfg)'
                if enabled_tenants
                else 'multi-tenant(env)',
                'per_tenant': per_tenant,
                **totals,
            }

    docs: List[Dict] = []
    source = 'none'

    cfg = None
    try:
        cfg = ESIntegrationConfig.objects.filter(tenant_id=tenant_id).first()
    except Exception:
        cfg = None

    if cfg and (cfg.enabled or force_config):
        docs = _http_search(cfg, {"size": size, "query": {"match": {"tenant_id": tenant_id}}})
        source = 'es-http(cfg)'
    else:
        docs = _fetch_docs_from_es_via_env(tenant_id=tenant_id, size=size)
        source = 'es-http(env)'

    inserted = 0
    updated = 0
    skipped = 0
    errors: List[str] = []

    if not docs:
        logger.info('No ES docs fetched (source=%s, tenant_id=%s)', source, tenant_id)
        return {"source": source, "fetched": 0, "inserted": 0, "updated": 0, "skipped": 0, "errors": []}

    for doc in docs:
        try:
            alert_id = doc.get('alert_id')
            doc_tenant_id = doc.get('tenant_id') if tenant_id is None else tenant_id

            defaults = {
                'tenant_id': doc_tenant_id,
                'timestamp': _parse_es_timestamp(doc.get('timestamp')),
                'severity': doc.get('severity'),
                'message': doc.get('message'),
                'source_index': doc.get('source_index'),
                'rule_id': doc.get('rule_id'),
                'title': doc.get('title'),
                'status': _coerce_int(doc.get('status')),
                'description': doc.get('description'),
                'category': doc.get('category'),
                'source_data': doc,
            }

            with transaction.atomic():
                if alert_id:
                    existing = Alert.objects.filter(alert_id=alert_id).order_by('-id').first()
                    if existing:
                        for k, v in defaults.items():
                            setattr(existing, k, v)
                        existing.save(update_fields=list(defaults.keys()))
                        created = False
                    else:
                        Alert.objects.create(alert_id=alert_id, **defaults)
                        created = True
                else:
                    Alert.objects.create(alert_id=None, **defaults)
                    created = True

            inserted += 1 if created else 0
            updated += 0 if created else 1
        except (IntegrityError, DatabaseError) as db_err:
            skipped += 1
            msg = f"db_error alert_id={doc.get('alert_id')} tenant_id={doc.get('tenant_id')}: {db_err}"
            errors.append(msg)
            logger.exception(msg)
        except Exception as e:
            skipped += 1
            msg = f"unexpected_error alert_id={doc.get('alert_id')} tenant_id={doc.get('tenant_id')}: {e}"
            errors.append(msg)
            logger.exception(msg)

    logger.info(
        'ES->DB sync done (source=%s tenant_id=%s fetched=%d inserted=%d updated=%d skipped=%d)',
        source,
        tenant_id,
        len(docs),
        inserted,
        updated,
        skipped,
    )
    return {
        'source': source,
        'fetched': len(docs),
        'inserted': inserted,
        'updated': updated,
        'skipped': skipped,
        'errors': errors[:10],
    }