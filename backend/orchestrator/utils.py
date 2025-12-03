import json
from django.utils import timezone
from .models import Task, TaskRun
from integrations.views import sync_es_to_db
from integrations.models import Integration

# -----------------------------
# 中文注释：
# 本模块提供任务执行的工具函数，当前仅包含 `execute_task`：
# - `execute_task(task)` 同步执行给定 Task 的逻辑并创建/更新对应的 TaskRun 记录
# - 当 Task 配置中指定 `sync: 'es_to_db'` 时，会调用 `sync_es_to_db` 将 Elasticsearch 中的数据导入目标数据库
# - 执行过程中会记录日志行到 TaskRun.logs 字段，并在完成后设置状态（success/failed）与结束时间
#
# 该函数被 API（TaskViewSet.run）和调度器（management command scheduler）复用，方便在多种执行环境下保持一致的行为。
# 注意：本文件仅添加注释，不修改已有行为。
# -----------------------------


def execute_task(task: Task) -> TaskRun:
    """Execute a Task synchronously and return the created TaskRun.
    This mirrors the logic previously in the TaskViewSet.run action so it can be
    reused by a scheduler or the API endpoint.
    """
    run = TaskRun.objects.create(task=task, started_at=timezone.now(), status='running')
    cfg = task.config or {}
    log_lines = []
    try:
        if cfg.get('sync') == 'es_to_db':
            src_id = cfg.get('source_integration')
            dest_id = cfg.get('dest_integration')
            index = cfg.get('index')
            limit = cfg.get('limit', 1000)
            # locate integrations
            try:
                es_it = Integration.objects.get(id=src_id)
                dest_it = Integration.objects.get(id=dest_id)
            except Integration.DoesNotExist as nde:
                raise Exception(f"Integration not found: {nde}")

            # If task provides a table override, inject it into a copy of the dest integration config
            if cfg.get('table'):
                try:
                    import copy
                    dest_it = copy.deepcopy(dest_it)
                    dest_cfg = dest_it.config or {}
                    dest_cfg['table'] = cfg.get('table')
                    dest_it.config = dest_cfg
                except Exception:
                    pass

            log_lines.append(f"Starting ES->DB sync from index={index} limit={limit}")
            query = cfg.get('query')
            # if no explicit query, try to compute a range from timestamp fields (caller may set this)
            if not query and cfg.get('timestamp_field') and cfg.get('timestamp_from'):
                query = { 'query': { 'range': { cfg.get('timestamp_field'): { 'gte': cfg.get('timestamp_from'), 'lte': cfg.get('timestamp_to', 'now') } } } }

            res = sync_es_to_db(es_it, index, dest_it, query=query, limit=limit)
            log_lines.append(f"Sync result: {json.dumps({k:v for k,v in res.items() if k!='rows' and k!='log_path'})}")
            # if sync produced a log file, try to include its contents
            try:
                lp = res.get('log_path')
                if lp:
                    import os
                    if os.path.isfile(lp):
                        with open(lp, 'r', encoding='utf-8') as lf:
                            log_lines.append('\n---- sync log file ----')
                            log_lines.append(lf.read())
            except Exception:
                pass
        else:
            log_lines.append(f"Executing task {task.id}")
            log_lines.append(f"Config: {json.dumps(task.config)}")

        run.logs = "\n".join(log_lines)
        run.status = 'success'
        run.finished_at = timezone.now()
        run.save()
        return run
    except Exception as e:
        run.status = 'failed'
        run.logs = str(e)
        run.finished_at = timezone.now()
        run.save()
        return run
