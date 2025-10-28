from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from .services import AlertService
from .models import ESIntegrationConfig, WebhookConfig
from .serializers import ESIntegrationConfigSerializer, WebhookConfigSerializer
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import permission_classes

from .services import _index_has_field, _http_search, _detect_es_major_version

class AlertListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant_id = request.user.profile.tenant_id
        # honor query params to force mock or force ES when requested by the frontend
        force_mock = request.GET.get('mock') in ['1', 'true', 'True']
        force_es = request.GET.get('force_es') in ['1', 'true', 'True']
        alerts, source = AlertService.list_alerts_for_tenant(tenant_id, force_es=force_es, force_mock=force_mock)
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
        tenant_id = request.user.profile.tenant_id
        force_mock = request.GET.get('mock') in ['1', 'true', 'True']
        force_es = request.GET.get('force_es') in ['1', 'true', 'True']
        data = AlertService.aggregate_dashboard(tenant_id, force_es=force_es, force_mock=force_mock)
        return Response(data)


# New endpoints for ES and webhook configuration
class ESConfigView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant_id = request.user.profile.tenant_id
        cfg = ESIntegrationConfig.objects.filter(tenant_id=tenant_id).first()
        if not cfg:
            return Response({}, status=status.HTTP_404_NOT_FOUND)
        return Response(ESIntegrationConfigSerializer(cfg).data)

    def post(self, request):
        tenant_id = request.user.profile.tenant_id
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
        tenant_id = request.user.profile.tenant_id
        cfg = WebhookConfig.objects.filter(tenant_id=tenant_id).first()
        if not cfg:
            # webhook is optional: return empty object instead of 404
            return Response({})
        return Response(WebhookConfigSerializer(cfg).data)

    def post(self, request):
        tenant_id = request.user.profile.tenant_id
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
        tenant_id = request.user.profile.tenant_id
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
