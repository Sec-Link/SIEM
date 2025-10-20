from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from .services import AlertService

class AlertListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant_id = request.user.profile.tenant_id
        alerts = AlertService.list_alerts_for_tenant(tenant_id)
        page = int(request.GET.get('page', 1))
        page_size = int(request.GET.get('page_size', 20))
        start = (page - 1) * page_size
        end = start + page_size
        return Response({
            'alerts': alerts[start:end],
            'page': page,
            'page_size': page_size,
            'total': len(alerts)
        })

class AlertDashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant_id = request.user.profile.tenant_id
        data = AlertService.aggregate_dashboard(tenant_id)
        return Response(data)
