from django.urls import path
from .views import AlertListView, AlertDashboardView

urlpatterns = [
    path('list/', AlertListView.as_view(), name='alert-list'),
    path('dashboard/', AlertDashboardView.as_view(), name='alert-dashboard'),
]
