from django.db import models

class Ticket(models.Model):
    ticket_id = models.CharField(max_length=64, unique=True)
    tenant_id = models.CharField(max_length=64, db_index=True)
    status = models.CharField(max_length=32)
    title = models.CharField(max_length=128)
    description = models.TextField()
    related_alert_id = models.CharField(max_length=64, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.ticket_id} ({self.tenant_id})"
