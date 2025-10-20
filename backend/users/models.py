from django.db import models
from django.contrib.auth.models import User

class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    tenant_id = models.CharField(max_length=64, db_index=True)

    def __str__(self):
        return f"{self.user.username} ({self.tenant_id})"
