from django.core.management.base import BaseCommand
from django.contrib.auth.models import User

class Command(BaseCommand):
    help = 'Create test users for development purposes'

    def handle(self, *args, **kwargs):
        test_users = [
            {"username": "alice", "password": "Password123!", "is_superuser": True, "is_staff": True},
            {"username": "bob", "password": "Password123!", "is_superuser": False, "is_staff": True},
            {"username": "charlie", "password": "Password123!", "is_superuser": False, "is_staff": False},
        ]

        for user_data in test_users:
            if not User.objects.filter(username=user_data["username"]).exists():
                user = User.objects.create_user(
                    username=user_data["username"],
                    password=user_data["password"]
                )
                user.is_superuser = user_data["is_superuser"]
                user.is_staff = user_data["is_staff"]
                user.save()
                self.stdout.write(self.style.SUCCESS(f"Created user: {user_data['username']}"))
            else:
                self.stdout.write(self.style.WARNING(f"User {user_data['username']} already exists."))