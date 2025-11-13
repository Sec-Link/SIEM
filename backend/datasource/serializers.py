from rest_framework import serializers
from .models import DataSet
from .models import DataSource

# -----------------------------
# 中文注释：
# 本模块提供 DataSet 与 DataSource 的序列化器：
# - `DataSetSerializer` 用于序列化/反序列化 DataSet（包括 payload、datasource、query）
# - `DataSourceSerializer` 提供 DataSource 的字段，password 字段被设置为 write_only 以避免泄露
#
# 注：不更改序列化规则，仅添加说明。
# -----------------------------


class DataSetSerializer(serializers.ModelSerializer):
    class Meta:
        model = DataSet
        fields = ['id', 'name', 'payload', 'datasource', 'query', 'created_at']


class DataSourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = DataSource
        fields = ['id', 'name', 'db_type', 'host', 'port', 'database', 'user', 'password', 'created_at']
        extra_kwargs = {
            'password': {'write_only': True, 'allow_blank': True},
            'created_at': {'read_only': True},
        }
