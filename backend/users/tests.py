from django.test import TestCase
from django.contrib.auth.models import User
from users.models import UserProfile
from rest_framework.test import APIClient


class AuthTests(TestCase):
    def test_login(self):
        # Use a generated password for tests to avoid hardcoded credentials
        test_password = User.objects.make_random_password()
        user = User.objects.create_user(username='bob', password=test_password)
        UserProfile.objects.create(user=user, tenant_id='tenant_b')
        client = APIClient()
        resp = client.post('/api/v1/auth/login', {'username': 'bob', 'password': test_password}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('access', resp.data)
        self.assertEqual(resp.data['tenant_id'], 'tenant_b')
