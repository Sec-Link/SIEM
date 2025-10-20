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
