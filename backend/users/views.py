from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.contrib.auth import authenticate
from rest_framework_simplejwt.tokens import RefreshToken
from users.models import UserProfile
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
import logging

logger = logging.getLogger(__name__)

@method_decorator(csrf_exempt, name='dispatch')
class LoginView(APIView):
    authentication_classes = []
    permission_classes = []

    def post(self, request):
        username = request.data.get('username')
        password = request.data.get('password')
        # optional tenant override from login form (for multi-tenant testing)
        tenant_override = request.data.get('tenant_id')
        logger.info("Login attempt username=%s", username)
        user = authenticate(username=username, password=password)
        if not user:
            logger.warning("Login failed for username=%s", username)
            return Response({'detail': 'Invalid credentials'}, status=status.HTTP_401_UNAUTHORIZED)
        refresh = RefreshToken.for_user(user)
        # Graceful profile fetch
        tenant_id = None
        try:
            tenant_id = user.profile.tenant_id
        except UserProfile.DoesNotExist:  # type: ignore
            logger.error("User %s has no profile; creating placeholder", user.username)
            UserProfile.objects.create(user=user, tenant_id='tenant_unassigned')
            tenant_id = 'tenant_unassigned'
        # if a tenant override was provided, set it on the user's profile
        if tenant_override:
            try:
                if tenant_override != tenant_id:
                    user.profile.tenant_id = tenant_override
                    user.profile.save()
                    tenant_id = tenant_override
                    logger.info('Set tenant_id for user %s to %s via login override', user.username, tenant_override)
            except Exception as e:
                logger.warning('Failed to set tenant override for user %s: %s', user.username, e)
        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'tenant_id': tenant_id,
            'username': user.username
        })
