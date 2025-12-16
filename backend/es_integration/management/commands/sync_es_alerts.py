"""Sync Elasticsearch alerts into Postgres.

Usage examples:
- python manage.py sync_es_alerts --tenant tenant_1
- python manage.py sync_es_alerts --tenant tenant_1 --size 500
- python manage.py sync_es_alerts  # sync all enabled tenants from ESIntegrationConfig; falls back to env if none

This is the recommended entry point for manually validating ES->DB sync.
"""

from django.core.management.base import BaseCommand

from es_integration.tasks import sync_es_alerts_to_db


class Command(BaseCommand):
    help = "Fetch alerts from Elasticsearch and upsert into es_integration_alert"

    def add_arguments(self, parser):
        parser.add_argument('--tenant', dest='tenant_id', default=None)
        parser.add_argument('--size', dest='size', type=int, default=100)
        parser.add_argument(
            '--force-config',
            dest='force_config',
            action='store_true',
            help='Use tenant ESIntegrationConfig even if disabled',
        )

    def handle(self, *args, **options):
        tenant_id = options.get('tenant_id')
        size = options.get('size')
        force_config = bool(options.get('force_config'))
        result = sync_es_alerts_to_db(tenant_id=tenant_id, size=size, force_config=force_config)
        self.stdout.write(self.style.SUCCESS(str(result)))
