"""Set a user's tenant_id (targeted).

Usage:
- python manage.py set_user_tenant --username alice --tenant tenant_1

This is the safest way to resolve tenant mismatches (e.g., user profile tenant != ES data tenant).
"""

from django.core.management.base import BaseCommand

from users.models import UserProfile


class Command(BaseCommand):
    help = "Set UserProfile.tenant_id for a single user"

    def add_arguments(self, parser):
        parser.add_argument('--username', dest='username', required=True)
        parser.add_argument('--tenant', dest='tenant_id', required=True)

    def handle(self, *args, **options):
        username = options['username']
        tenant_id = options['tenant_id']

        profile = UserProfile.objects.select_related('user').filter(user__username=username).first()
        if not profile:
            self.stderr.write(self.style.ERROR(f"UserProfile not found for username={username}"))
            return

        if profile.tenant_id == tenant_id:
            self.stdout.write(self.style.SUCCESS(f"no_change username={username} tenant_id={tenant_id}"))
            return

        profile.tenant_id = tenant_id
        profile.save(update_fields=['tenant_id'])
        self.stdout.write(self.style.SUCCESS(f"updated username={username} tenant_id={tenant_id}"))
