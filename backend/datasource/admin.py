"""
datasets.admin
中文说明：
该模块负责将 DataSource 模型注册到 Django 管理后台（admin site），并指定在列表视图中展示的列。

设计说明：
- 早期项目中存在 DataSet 在 admin 中的管理入口。但现在数据集的管理流程已被 SQL preview + 数据源功能替代，
    因此 DataSet 没有暴露在 admin 中。本文件只对 DataSource 进行展示注册，便于管理员查看/维护数据源连接信息。

注意：本文件仅添加说明性注释，不更改任何运行逻辑或 admin 配置字段。
"""

from django.contrib import admin
from .models import DataSource

# DataSource 在 admin 中注册，list_display 用于控制列表页显示的列
@admin.register(DataSource)
class DataSourceAdmin(admin.ModelAdmin):
        list_display = ('id','name','db_type','host','database','created_at')

# 说明：DataSet 未注册到 admin（已通过前端 SQL Preview 管理），保留此处注释以便未来维护者理解原因