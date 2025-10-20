from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from users.models import UserProfile

class Command(BaseCommand):
    help = 'Seed demo tenants and users'

    def handle(self, *args, **options):
        demo = [
            ('alice', 'tenant_a'),
            ('bob', 'tenant_b'),
            ('carol', 'tenant_c'),
        ]
        for username, tenant in demo:
            user, created = User.objects.get_or_create(username=username)
            if created:
                user.set_password('Password123!')
                user.save()
            UserProfile.objects.get_or_create(user=user, tenant_id=tenant)
        self.stdout.write(self.style.SUCCESS('Seeded demo users'))
