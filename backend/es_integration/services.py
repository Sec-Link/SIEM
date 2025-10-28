import json
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Tuple
import logging
import inspect
import urllib.request
import urllib.error

from .models import ESIntegrationConfig

MOCK_FILE = Path(__file__).resolve().parent / 'mock_alerts.json'

try:
    from elasticsearch import Elasticsearch
except Exception:
    Elasticsearch = None

logger = logging.getLogger(__name__)


def _detect_es_major_version(host_url: str, timeout: int = 5) -> int:
    """Try a simple HTTP GET to the ES host root and parse version number.

    Returns the major version (int) or a sensible default (8) on failure.
    """
    try:
        if not host_url.startswith('http'):
            host_url = 'http://' + host_url
        if not host_url.endswith('/'):
            host_url = host_url + '/'
        with urllib.request.urlopen(host_url, timeout=timeout) as resp:
            body = resp.read()
            data = json.loads(body.decode('utf-8'))
            ver = data.get('version', {}).get('number')
            if ver:
                major = int(str(ver).split('.')[0])
                return major
    except Exception as e:
        logger.debug('ES version detection failed for %s: %s', host_url, e)
    return 8  # sensible default


def _http_search(cfg: ESIntegrationConfig, body: dict, timeout: int = 30) -> List[Dict]:
    """Perform a direct HTTP POST to ES _search with proper media-type headers."""
    hosts = cfg.hosts_list()
    if not hosts:
        return []
    host = hosts[0]
    if not host.startswith('http'):
        host = 'http://' + host
    if host.endswith('/'):
        host = host[:-1]
    url = f"{host}/{cfg.index}/_search"
    # Try the detected server major version first, then fall back to 8 and 7
    detected = _detect_es_major_version(host)
    try_versions = []
    if detected not in try_versions:
        try_versions.append(detected)
    for v in (8, 7):
        if v not in try_versions:
            try_versions.append(v)

    data = json.dumps(body).encode('utf-8')
    last_exc = None
    for compat_version in try_versions:
        media_type = f"application/vnd.elasticsearch+json; compatible-with={compat_version}"
        headers = {"Accept": media_type, "Content-Type": media_type}
        req = urllib.request.Request(url, data=data, headers=headers, method='POST')
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                text = resp.read().decode('utf-8')
                res = json.loads(text)
                hits = [h.get('_source', {}) for h in res.get('hits', {}).get('hits', [])]
                logger.info('HTTP _search succeeded with compatible-with=%s, returned %d hits', compat_version, len(hits))
                return hits
        except urllib.error.HTTPError as http_err:
            # HTTP 400 media-type mismatch or similar — try next compat version
            try:
                body_text = http_err.read().decode('utf-8')
            except Exception:
                body_text = ''
            logger.warning('HTTP _search failed for compatible-with=%s: %s %s', compat_version, http_err, body_text)
            last_exc = http_err
            # If the error indicates missing mapping for timestamp (we sorted on it), retry once without sort
            if 'No mapping found for [timestamp' in body_text or 'No mapping found for timestamp' in body_text:
                try:
                    body_nosort = dict(body)
                    if 'sort' in body_nosort:
                        del body_nosort['sort']
                    data_n = json.dumps(body_nosort).encode('utf-8')
                    req2 = urllib.request.Request(url, data=data_n, headers=headers, method='POST')
                    with urllib.request.urlopen(req2, timeout=timeout) as resp2:
                        text2 = resp2.read().decode('utf-8')
                        res2 = json.loads(text2)
                        hits2 = [h.get('_source', {}) for h in res2.get('hits', {}).get('hits', [])]
                        logger.info('HTTP _search (no sort) succeeded with compatible-with=%s, returned %d hits', compat_version, len(hits2))
                        return hits2
                except Exception as e:
                    logger.warning('Retry without sort also failed for compatible-with=%s: %s', compat_version, e)
            continue
        except urllib.error.URLError as url_err:
            # Network-level error — no point in trying different media types
            logger.exception('Network error when attempting HTTP _search to %s: %s', url, url_err)
            last_exc = url_err
            break
        except Exception as e:
            logger.exception('Unexpected error during HTTP _search attempt: %s', e)
            last_exc = e
            continue

    if last_exc:
        logger.debug('All HTTP fallback attempts failed for %s (tried versions %s)', url, try_versions)
    return []


def _index_has_field(cfg: ESIntegrationConfig, field: str, timeout: int = 5) -> bool:
    """Check the index mapping to see if a top-level field exists (best-effort).

    Returns True if mapping indicates the field exists, False otherwise.
    """
    hosts = cfg.hosts_list()
    if not hosts:
        return False
    host = hosts[0]
    if not host.startswith('http'):
        host = 'http://' + host
    if host.endswith('/'):
        host = host[:-1]
    url = f"{host}/{cfg.index}/_mapping"
    try:
        req = urllib.request.Request(url, method='GET')
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            text = resp.read().decode('utf-8')
            data = json.loads(text)
            # mapping structure may vary; search for the field name in mapping properties
            def find_field(d):
                if isinstance(d, dict):
                    for k, v in d.items():
                        if k == field:
                            return True
                        if isinstance(v, dict):
                            if find_field(v):
                                return True
                return False
            return find_field(data)
    except Exception as e:
        logger.debug('Failed to fetch mapping for %s/%s: %s', cfg.hosts_list(), cfg.index, e)
        return False


def _detect_timestamp_field(cfg: ESIntegrationConfig, candidates=None) -> str:
    """Return the first matching timestamp-like field name present in the index mapping.

    Checks common candidates and returns the first found, or None if none found.
    """
    if candidates is None:
        candidates = ['timestamp', '@timestamp', 'time', 'event_time']
    try:
        hosts = cfg.hosts_list() or []
        if not hosts:
            return None
        host = hosts[0]
        url = f"{host.rstrip('/')}/{cfg.index}/_mapping"
        req = urllib.request.Request(url, method='GET')
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            # Convert to string and search for field names (best-effort)
            text = json.dumps(data)
            for c in candidates:
                if f'"{c}"' in text:
                    return c
    except Exception as e:
        logger.debug('Failed to detect timestamp field for %s/%s: %s', cfg.hosts_list(), cfg.index, e)
    return None


def _resolve_timestamp_sort_field(cfg: ESIntegrationConfig, detected_field: str, candidates=None) -> str:
    """Return a field name usable for sorting/aggregation.

    Prefers a field mapped as 'date' (or date_nanos), otherwise a '.keyword' subfield if present.
    Returns None if no sortable field is found.
    """
    if candidates is None:
        # ensure detected_field is first
        candidates = [detected_field] if detected_field else []
        for c in ['@timestamp', 'timestamp', 'time', 'event_time']:
            if c not in candidates:
                candidates.append(c)

    # fetch mapping
    hosts = cfg.hosts_list() or []
    if not hosts:
        return None
    host = hosts[0]
    try:
        url = f"{host.rstrip('/')}/{cfg.index}/_mapping"
        req = urllib.request.Request(url, method='GET')
        with urllib.request.urlopen(req, timeout=5) as resp:
            mapping = json.loads(resp.read().decode('utf-8'))
    except Exception as e:
        logger.debug('Failed to fetch mapping for resolving timestamp field: %s', e)
        return None

    def search_properties(obj, prefix=''):
        # obj is a mapping dict; look into 'properties'
        props = obj.get('properties') if isinstance(obj, dict) else None
        if not props:
            return None
        for name, meta in props.items():
            full = f"{prefix}{name}" if prefix == '' else f"{prefix}.{name}"
            # check if this name is one of candidates
            if name in candidates:
                ftype = meta.get('type')
                if ftype and ftype.startswith('date'):
                    return full
                # check for keyword subfield
                fields = meta.get('fields') or {}
                if 'keyword' in fields:
                    return f"{full}.keyword"
            # recurse into nested properties
            nested = search_properties(meta, full)
            if nested:
                return nested
        return None

    # mapping may have index -> mappings -> properties or older shapes
    # try several likely roots
    roots = []
    if isinstance(mapping, dict):
        for k, v in mapping.items():
            roots.append(v.get('mappings') or v)
    else:
        roots = [mapping]

    for r in roots:
        res = search_properties(r)
        if res:
            return res
    return None


def _get_source_field_value(doc: Dict, field: str):
    """Get value from document _source for a field name, handling '.keyword' by using base field."""
    if not isinstance(doc, dict):
        return None
    base = field.split('.')[0]
    return doc.get(base)


class AlertService:
    @staticmethod
    def load_mock_alerts() -> List[Dict]:
        with open(MOCK_FILE) as f:
            data = json.load(f)
        return data

    @staticmethod
    def _build_es_client(cfg: ESIntegrationConfig):
        if not Elasticsearch:
            return None
        hosts = cfg.hosts_list()
        auth = None
        if cfg.username:
            auth = (cfg.username, cfg.password)

        # determine compatible media type based on ES server version
        compat_version = 8
        if hosts:
            try:
                compat_version = _detect_es_major_version(hosts[0])
                # cap to 8 to avoid sending unsupported compatible-with values (some clusters reject >8)
                if compat_version and isinstance(compat_version, int):
                    compat_version = min(compat_version, 8)
            except Exception:
                compat_version = 8

        media_type = f"application/vnd.elasticsearch+json; compatible-with={compat_version}"
        default_headers = {"Accept": media_type, "Content-Type": media_type}

        # adapt to elasticsearch client versions
        try:
            sig = inspect.signature(Elasticsearch.__init__)
            params = sig.parameters
            init_args = {}
            if 'basic_auth' in params:
                if auth:
                    init_args['basic_auth'] = auth
            elif 'http_auth' in params:
                if auth:
                    init_args['http_auth'] = auth
            # pass headers if client supports it
            if 'headers' in params:
                init_args['headers'] = default_headers
            elif 'default_headers' in params:
                init_args['default_headers'] = default_headers

            client = Elasticsearch(hosts=hosts, **init_args)
            return client
        except Exception as e:
            logger.exception('Failed to build Elasticsearch client: %s', e)
            try:
                return Elasticsearch(hosts=hosts)
            except Exception:
                return None

    @staticmethod
    def list_alerts_for_tenant(tenant_id: str, force_es: bool = False, force_mock: bool = False) -> Tuple[List[Dict], str]:
        """Return (alerts, source) where source is 'es', 'es-http' or 'mock'."""
        if force_mock:
            alerts = AlertService.load_mock_alerts()
            return [a for a in alerts if a['tenant_id'] == tenant_id], 'mock'
        # Check ES config
        try:
            cfg = ESIntegrationConfig.objects.filter(tenant_id=tenant_id).first()
        except Exception:
            cfg = None

        if cfg and (cfg.enabled or force_es):
            # Determine whether to prefer the HTTP fallback based on server version
            prefer_http = False
            hosts = []
            try:
                hosts = cfg.hosts_list() or []
            except Exception:
                hosts = []

            server_major = None
            if hosts:
                try:
                    server_major = _detect_es_major_version(hosts[0])
                    if server_major and server_major < 9:
                        logger.info('ES server reports major version %s; preferring HTTP fallback to avoid media-type mismatch', server_major)
                        prefer_http = True
                except Exception:
                    # leave prefer_http as False; we'll attempt client then fallback
                    server_major = None

            # Determine the timestamp field to use (support different mappings)
            detected_ts = _detect_timestamp_field(cfg)
            # try to resolve a sortable field (date type or .keyword)
            resolved_sort_field = _resolve_timestamp_sort_field(cfg, detected_ts)
            include_sort = bool(resolved_sort_field)

            # Try using python client if available and not explicitly preferring HTTP
            if Elasticsearch and not prefer_http:
                es = AlertService._build_es_client(cfg)
                if es:
                    try:
                        body = {"size": 100, "query": {"match": {"tenant_id": tenant_id}}}
                        if include_sort and resolved_sort_field:
                            body['sort'] = [{resolved_sort_field: {"order": "desc"}}]
                        res = es.search(index=cfg.index, body=body, request_timeout=30)
                        hits = [h.get('_source', {}) for h in res.get('hits', {}).get('hits', [])]
                        logger.info('Fetched %d alerts from ES for tenant %s', len(hits), tenant_id)
                        return hits, 'es'
                    except Exception as e:
                        logger.exception('Elasticsearch query failed: %s', e)
                        # fallthrough to HTTP fallback below
            # HTTP fallback (either because client not available/failed, or server advised to prefer HTTP)
            try:
                body = {"size": 100, "query": {"match": {"tenant_id": tenant_id}}}
                if include_sort and resolved_sort_field:
                    body['sort'] = [{resolved_sort_field: {"order": "desc"}}]
                hits = _http_search(cfg, body, timeout=30)
                if hits:
                    logger.info('Fetched %d alerts from ES via HTTP fallback for tenant %s', len(hits), tenant_id)
                    return hits, 'es-http'
            except Exception as e2:
                logger.exception('HTTP fallback failed: %s', e2)

        alerts = AlertService.load_mock_alerts()
        return [a for a in alerts if a['tenant_id'] == tenant_id], 'mock'

    @staticmethod
    def aggregate_dashboard(tenant_id: str, force_es: bool = False, force_mock: bool = False) -> Dict:
        alerts, source = AlertService.list_alerts_for_tenant(tenant_id, force_es=force_es, force_mock=force_mock)
        severity_counts = {}
        timeline = {}
        source_index_counts = {}
        daily_trend = {}
        message_topN = {}
        ts_field = None
        try:
            cfg = ESIntegrationConfig.objects.filter(tenant_id=tenant_id).first()
            if cfg:
                ts_field = _detect_timestamp_field(cfg) or 'timestamp'
        except Exception:
            ts_field = 'timestamp'
        for a in alerts:
            sev = a.get('severity', 'unknown')
            severity_counts[sev] = severity_counts.get(sev, 0) + 1
            # group by hour
            raw_ts = _get_source_field_value(a, ts_field) if isinstance(a, dict) else None
            hour = 'unknown'
            day = 'unknown'
            if raw_ts is None:
                hour = 'unknown'
                day = 'unknown'
            else:
                if isinstance(raw_ts, str):
                    try:
                        dt = datetime.fromisoformat(raw_ts)
                        hour = dt.strftime('%Y-%m-%dT%H')
                        day = dt.strftime('%Y-%m-%d')
                    except Exception:
                        hour = raw_ts[:13]
                        day = raw_ts[:10]
                else:
                    try:
                        dt = datetime.fromisoformat(str(raw_ts))
                        hour = dt.strftime('%Y-%m-%dT%H')
                        day = dt.strftime('%Y-%m-%d')
                    except Exception:
                        hour = 'unknown'
                        day = 'unknown'
            timeline[hour] = timeline.get(hour, 0) + 1
            daily_trend[day] = daily_trend.get(day, 0) + 1
            # 按 source_index 统计
            idx = a.get('source_index')
            if not idx:
                idx = a.get('_index', 'unknown')
            source_index_counts[idx] = source_index_counts.get(idx, 0) + 1
            # message 整条统计
            msg = a.get('message', '')
            if msg:
                message_topN[msg] = message_topN.get(msg, 0) + 1
        # 只返回 message 出现最多的前 20 条
        top_messages = dict(sorted(message_topN.items(), key=lambda x: x[1], reverse=True)[:20])
        return {
            'severity': severity_counts,
            'timeline': timeline,
            'total': len(alerts),
            'source': source,
            'source_index': source_index_counts,
            'daily_trend': daily_trend,
            'top_messages': top_messages
        }
