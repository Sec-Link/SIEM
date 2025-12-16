"""(Deprecated) Force UserProfile.tenant_id to tenant_1.

This command was introduced during a temporary "single-tenant" debugging phase.
To avoid accidental mass updates, it now requires either:
- `--username <name>` (recommended)
- or `--all` (explicitly update all profiles)

Prefer using `python manage.py set_user_tenant --username alice --tenant tenant_1`.
"""

from django.core.management.base import BaseCommand

from users.models import UserProfile


class Command(BaseCommand):
    help = "Force UserProfile.tenant_id to tenant_1"

    def add_arguments(self, parser):
        parser.add_argument('--username', dest='username', default=None)
        parser.add_argument(
            '--all',
            dest='update_all',
            action='store_true',
            help='Update all user profiles (dangerous).',
        )

    def handle(self, *args, **options):
        username = options.get('username')
        update_all = bool(options.get('update_all'))

        if not username and not update_all:
            self.stderr.write('Refusing to update all profiles without --all. Use --username alice instead.')
            return

        qs = UserProfile.objects.all()
        if username:
            qs = qs.filter(user__username=username)

        updated = qs.exclude(tenant_id='tenant_1').update(tenant_id='tenant_1')
        self.stdout.write(self.style.SUCCESS(f"updated_profiles={updated}"))
