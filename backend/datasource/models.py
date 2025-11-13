import uuid
from django.db import models

# -----------------------------
# 中文注释：
# 数据集（DataSet）与数据源（DataSource）模型定义：
# - `DataSet` 支持两种使用场景：内存型 payload（用于快速预览）或通过 datasource/query 关联 SQL 数据源
# - `DataSource` 保存连接信息（db_type, host, port, database, user, password），用于在 API 中测试/临时连接和查询
#
# 这些模型是系统中执行 SQL 查询、数据预览和构建仪表盘数据源的基础。
# -----------------------------


class DataSet(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    # payload kept for ad-hoc in-memory datasets; for SQL-backed datasets use datasource/query
    payload = models.JSONField(default=list)
    # Optional link to a DataSource for SQL-backed datasets
    datasource = models.ForeignKey('DataSource', null=True, blank=True, on_delete=models.SET_NULL)
    # A simple SQL query or table name (the preview endpoint will prefer table if provided)
    query = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class DataSource(models.Model):
    DB_CHOICES = [
        ('postgres', 'PostgreSQL'),
        ('mysql', 'MySQL'),
        ('sqlite', 'SQLite')
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    db_type = models.CharField(max_length=32, choices=DB_CHOICES, default='postgres')
    host = models.CharField(max_length=200, blank=True, null=True)
    port = models.IntegerField(blank=True, null=True)
    database = models.CharField(max_length=200, blank=True, null=True)
    user = models.CharField(max_length=200, blank=True, null=True)
    password = models.CharField(max_length=200, blank=True, null=True)
    # for sqlite, the host/database field may be the file path
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.db_type})"
