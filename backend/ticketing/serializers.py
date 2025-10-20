from rest_framework import serializers
from .models import Ticket

class TicketSerializer(serializers.ModelSerializer):
    class Meta:
        model = Ticket
        fields = ['ticket_id', 'tenant_id', 'status', 'title', 'description', 'related_alert_id', 'created_at']
        read_only_fields = ['tenant_id', 'created_at']
