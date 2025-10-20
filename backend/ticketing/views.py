from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from .models import Ticket
from .serializers import TicketSerializer
import uuid

class TicketViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = TicketSerializer
    lookup_field = 'ticket_id'

    def get_queryset(self):
        tenant_id = self.request.user.profile.tenant_id
        return Ticket.objects.filter(tenant_id=tenant_id)

    def create(self, request, *args, **kwargs):
        data = request.data.copy()
        data['ticket_id'] = data.get('ticket_id') or str(uuid.uuid4())
        data['tenant_id'] = request.user.profile.tenant_id
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
