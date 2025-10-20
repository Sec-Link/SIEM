from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from users.models import UserProfile

class Command(BaseCommand):
    help = 'Seed demo tenant users'

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
            # fetch or create profile with defaults; if exists, update tenant_id
            profile, p_created = UserProfile.objects.get_or_create(user=user, defaults={'tenant_id': tenant})
            if not p_created and profile.tenant_id != tenant:
                profile.tenant_id = tenant
                profile.save(update_fields=['tenant_id'])
        self.stdout.write(self.style.SUCCESS('Seeded demo tenant users'))
