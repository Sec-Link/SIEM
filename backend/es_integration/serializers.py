from rest_framework import serializers
from .models import ESIntegrationConfig, WebhookConfig

class ESIntegrationConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = ESIntegrationConfig
        fields = ['tenant_id', 'enabled', 'hosts', 'index', 'username', 'password', 'use_ssl', 'verify_certs']
        read_only_fields = ['tenant_id']

class WebhookConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = WebhookConfig
        fields = ['tenant_id', 'url', 'method', 'headers', 'active']
        read_only_fields = ['tenant_id']
