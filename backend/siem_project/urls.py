from django.contrib import admin
from django.urls import path, include
from users.views import LoginView
from django.urls import path, include
from django.contrib import admin
from rest_framework import routers
from dashboards.views import DashboardViewSet
from datasource.views import DataSourceViewSet
from datasource.views import datasource_fields
from datasource.views import datasource_test
from datasource.views import query_preview
from integrations.views import test_es_connection
from integrations.views import IntegrationViewSet, preview_es_index
from integrations.views import integrations_db_tables, integrations_create_table, integrations_create_table_from_es, integrations_preview_es_mapping
from orchestrator.views import TaskViewSet, TaskRunViewSet, TaskRequestLogViewSet


router = routers.DefaultRouter()
router.register(r'dashboards', DashboardViewSet, basename='dashboard')
router.register(r'datasources', DataSourceViewSet, basename='datasource')
router.register(r'integrations', IntegrationViewSet, basename='integration')
router.register(r'tasks', TaskViewSet, basename='task')
router.register(r'task_runs', TaskRunViewSet, basename='taskrun')
router.register(r'task_request_logs', TaskRequestLogViewSet, basename='taskrequestlog')

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/v1/auth/login/', LoginView.as_view(), name='login'),
    path('api/v1/auth/login', LoginView.as_view()),  # tolerate missing trailing slash
    path('api/v1/alerts/', include('es_integration.urls')),
    path('api/v1/tickets/', include('ticketing.urls')),
    # add by qk
    path('api/v1/datasource/fields', datasource_fields),
    path('api/v1/datasource/test', datasource_test),
    path('api/v1/query/preview', query_preview),
    path('api/v1/', include(router.urls)),
    path('api/v1/integrations/test_es', test_es_connection),
    path('api/v1/integrations/preview_es', preview_es_index),
    path('api/v1/integrations/db_tables', integrations_db_tables),
    path('api/v1/integrations/create_table', integrations_create_table),
    path('api/v1/integrations/create_table_from_es', integrations_create_table_from_es),
    path('api/v1/integrations/preview_es_mapping', integrations_preview_es_mapping),
]
