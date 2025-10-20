from django.contrib import admin
from django.urls import path, include
from users.views import LoginView

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/v1/auth/login/', LoginView.as_view(), name='login'),
    path('api/v1/auth/login', LoginView.as_view()),  # tolerate missing trailing slash
    path('api/v1/alerts/', include('es_integration.urls')),
    path('api/v1/tickets/', include('ticketing.urls')),
]
