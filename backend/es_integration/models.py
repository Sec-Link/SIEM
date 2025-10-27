from django.db import models

class Alert(models.Model):
    alert_id = models.CharField(max_length=64, unique=True)
    tenant_id = models.CharField(max_length=64, db_index=True)
    timestamp = models.DateTimeField()
    severity = models.CharField(max_length=16)
    message = models.TextField()
    source_index = models.CharField(max_length=64)

    def __str__(self):
        return f"{self.alert_id} ({self.tenant_id})"


class ESIntegrationConfig(models.Model):
    """Stores per-tenant Elasticsearch integration settings."""
    tenant_id = models.CharField(max_length=64, db_index=True, unique=True)
    enabled = models.BooleanField(default=False)
    hosts = models.TextField(help_text='Comma separated hosts, e.g. http://es1:9200,http://es2:9200', blank=True)
    index = models.CharField(max_length=128, default='alerts')
    username = models.CharField(max_length=128, blank=True)
    password = models.CharField(max_length=128, blank=True)
    use_ssl = models.BooleanField(default=False)
    verify_certs = models.BooleanField(default=True)

    def hosts_list(self):
        return [h.strip() for h in self.hosts.split(',') if h.strip()]

    def __str__(self):
        return f"ESConfig({self.tenant_id})"


class WebhookConfig(models.Model):
    """Stores per-tenant webhook configuration used to notify external systems."""
    tenant_id = models.CharField(max_length=64, db_index=True, unique=True)
    url = models.CharField(max_length=1024)
    method = models.CharField(max_length=8, default='POST')
    headers = models.JSONField(default=dict, blank=True)
    active = models.BooleanField(default=True)

    def __str__(self):
        return f"WebhookConfig({self.tenant_id})"
