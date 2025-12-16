"""API views for ES integration.

Endpoints:
- `AlertListView`: returns tenant alerts (prefers DB cache, falls back to ES/mock).
- `AlertDashboardView`: aggregated dashboard stats built from the same alert stream.
- `ESConfigView` / `WebhookConfigView`: per-tenant configuration.
"""

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from .services import AlertService
from .tasks import sync_es_alerts_to_db
from .models import ESIntegrationConfig, WebhookConfig
from .serializers import ESIntegrationConfigSerializer, WebhookConfigSerializer
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import permission_classes
import logging
from django.http import JsonResponse

from .services import _index_has_field, _http_search, _detect_es_major_version

# Configure logging
logger = logging.getLogger(__name__)

class AlertListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Tenant-scoped: derive tenant_id from the authenticated user's profile.
        try:
            tenant_id = request.user.profile.tenant_id
        except Exception:
            tenant_id = 'tenant_unassigned'
        # honor query params to force mock or force ES when requested by the frontend
        force_mock = request.GET.get('mock') in ['1', 'true', 'True']
        force_es = request.GET.get('force_es') in ['1', 'true', 'True']
        force_db = request.GET.get('force_db') in ['1', 'true', 'True']
        alerts, source = AlertService.list_alerts_for_tenant(
            tenant_id,
            force_es=force_es,
            force_mock=force_mock,
            force_db=force_db,
        )
        page = int(request.GET.get('page', 1))
        page_size = int(request.GET.get('page_size', 20))
        start = (page - 1) * page_size
        end = start + page_size
        resp = {
            'alerts': alerts[start:end],
            'page': page,
            'page_size': page_size,
            'total': len(alerts),
            'source': source
        }
        # If using mock and no alerts found, include sample tenant ids to help diagnose tenant mismatch
        if source == 'mock' and len(alerts) == 0:
            try:
                sample_alerts = AlertService.load_mock_alerts()
                tenants = sorted({a.get('tenant_id') for a in sample_alerts if a.get('tenant_id')})
                resp['mock_sample_tenants'] = tenants
                resp['mock_total_available'] = len(sample_alerts)
            except Exception:
                pass
        return Response(resp)

class AlertDashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tenant_id = request.user.profile.tenant_id
        except Exception:
            tenant_id = 'tenant_unassigned'
        force_mock = request.GET.get('mock') in ['1', 'true', 'True']
        force_es = request.GET.get('force_es') in ['1', 'true', 'True']
        force_db = request.GET.get('force_db') in ['1', 'true', 'True']
        
        # Logging for debugging
        logger.info("Received request for dashboard alerts")
        logger.info(f"User: {request.user}")
        logger.info(f"Headers: {request.headers}")
        
        try:
            data = AlertService.aggregate_dashboard(tenant_id, force_es=force_es, force_mock=force_mock, force_db=force_db)
            return Response(data)
        except Exception as e:
            logger.error(f"Error in dashboard_alerts: {e}")
            return Response({"error": "Internal Server Error"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class AlertSyncView(APIView):
    """Trigger a one-off ES->DB refresh for the current tenant.

    The dashboard can run in "Force DB" mode (read strictly from Postgres). This endpoint
    allows the frontend to refresh the DB on demand without relying on a separately
    running scheduler process.

    Query params:
    - size: number of ES docs to fetch (default: 100)
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            tenant_id = request.user.profile.tenant_id
        except Exception:
            tenant_id = 'tenant_unassigned'

        try:
            size = int(request.GET.get('size', 100))
        except Exception:
            size = 100

        try:
            result = sync_es_alerts_to_db(tenant_id=tenant_id, size=size)
            return Response({
                'ok': True,
                'tenant_id': tenant_id,
                **(result or {}),
            })
        except Exception as e:
            logger.exception('Failed to sync ES->DB (tenant=%s): %s', tenant_id, e)
            return Response(
                {
                    'ok': False,
                    'tenant_id': tenant_id,
                    'detail': str(e),
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


# New endpoints for ES and webhook configuration
class ESConfigView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tenant_id = request.user.profile.tenant_id
        except Exception:
            tenant_id = 'tenant_unassigned'
        cfg = ESIntegrationConfig.objects.filter(tenant_id=tenant_id).first()
        if not cfg:
            return Response({}, status=status.HTTP_404_NOT_FOUND)
        return Response(ESIntegrationConfigSerializer(cfg).data)

    def post(self, request):
        try:
            tenant_id = request.user.profile.tenant_id
        except Exception:
            tenant_id = 'tenant_unassigned'
        data = request.data.copy()
        data['tenant_id'] = tenant_id
        # allow partial so_frontend can submit only changed fields
        serializer = ESIntegrationConfigSerializer(data=data, partial=True)
        if serializer.is_valid():
            try:
                cfg, _ = ESIntegrationConfig.objects.update_or_create(tenant_id=tenant_id, defaults=serializer.validated_data)
                return Response(ESIntegrationConfigSerializer(cfg).data)
            except Exception as e:
                return Response({'detail': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class WebhookConfigView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tenant_id = request.user.profile.tenant_id
        except Exception:
            tenant_id = 'tenant_unassigned'
        cfg = WebhookConfig.objects.filter(tenant_id=tenant_id).first()
        if not cfg:
            # webhook is optional: return empty object instead of 404
            return Response({})
        return Response(WebhookConfigSerializer(cfg).data)

    def post(self, request):
        try:
            tenant_id = request.user.profile.tenant_id
        except Exception:
            tenant_id = 'tenant_unassigned'
        data = request.data.copy()
        data['tenant_id'] = tenant_id
        serializer = WebhookConfigSerializer(data=data, partial=True)
        if serializer.is_valid():
            try:
                cfg, _ = WebhookConfig.objects.update_or_create(tenant_id=tenant_id, defaults=serializer.validated_data)
                return Response(WebhookConfigSerializer(cfg).data)
            except Exception as e:
                return Response({'detail': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ESDiagnosticsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tenant_id = request.user.profile.tenant_id
        except Exception:
            tenant_id = 'tenant_unassigned'
        cfg = ESIntegrationConfig.objects.filter(tenant_id=tenant_id).first()
        if not cfg:
            return Response({'es': False, 'detail': 'no config found for tenant'}, status=status.HTTP_200_OK)

        hosts = cfg.hosts_list() or []
        host = hosts[0] if hosts else None
        server_version = None
        mapping_has_timestamp = False
        samples = []
        try:
            server_version = _detect_es_major_version(host) if host else None
        except Exception as e:
            server_version = None

        try:
            mapping_has_timestamp = _index_has_field(cfg, 'timestamp')
        except Exception:
            mapping_has_timestamp = False

        try:
            body = {"size": 5, "query": {"match": {"tenant_id": tenant_id}}}
            if mapping_has_timestamp:
                body['sort'] = [{"timestamp": {"order": "desc"}}]
            samples = _http_search(cfg, body, timeout=10)
        except Exception:
            samples = []

        return Response({
            'es': True,
            'host': host,
            'server_version': server_version,
            'mapping_has_timestamp': mapping_has_timestamp,
            'sample_count': len(samples),
            'samples': samples,
        })
