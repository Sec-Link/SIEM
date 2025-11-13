from django.core.management.base import BaseCommand
import time
from django.utils import timezone
from orchestrator.models import Task
from orchestrator.utils import execute_task

try:
    from croniter import croniter
except Exception:
    croniter = None


class Command(BaseCommand):
    help = 'Simple scheduler that runs due tasks based on cron expressions in Task.schedule'

    # 中文注释：
    # 简单的命令行调度器，适用于开发或轻量部署。工作流程：
    # 1. 周期性（--interval）轮询 Task 表
    # 2. 使用 croniter 解析 Task.schedule 中的 cron 表达式，判断是否落在本轮询窗口内
    # 3. 若到期则调用 execute_task 执行并记录运行（由 execute_task 创建 TaskRun）
    # 注意：
    # - 依赖第三方库 `croniter`；若未安装则命令会提示错误并退出
    # - 生产环境应优先使用成熟的调度系统（如 Celery Beat、Airflow）以获得更可靠的执行语义

    def add_arguments(self, parser):
        parser.add_argument('--interval', type=int, default=30, help='Poll interval seconds')

    def handle(self, *args, **options):
        interval = options.get('interval', 30)
        if croniter is None:
            self.stdout.write(self.style.ERROR('croniter is not installed. Install with `pip install croniter` to use scheduling.'))
            return

        self.stdout.write(self.style.SUCCESS(f'Starting scheduler with interval={interval}s'))
        try:
            while True:
                now = timezone.now()
                tasks = Task.objects.all()
                for t in tasks:
                    try:
                        # 计算上一次触发时间（prev），采用现在作为基准
                        base = now
                        it = croniter(t.schedule, base)
                        prev = it.get_prev(ret_type=timezone.datetime)
                        # 处理 timezone-aware / naive datetime 的情况
                        if isinstance(prev, timezone.datetime):
                            prev_dt = prev
                        else:
                            prev_dt = timezone.make_aware(prev)

                        # 如果上次触发发生在最近 interval 秒内，则认为该任务应在本轮被执行
                        delta = now - prev_dt
                        if delta.total_seconds() <= interval:
                            self.stdout.write(f'Running task {t.id} scheduled {t.schedule}')
                            r = execute_task(t)
                            self.stdout.write(f'Run {r.id} finished status={r.status}')
                    except Exception as e:
                        # 单个任务处理错误不会终止调度循环；记录错误继续处理其他任务
                        self.stderr.write(f'Error evaluating schedule for task {t.id}: {e}')
                time.sleep(interval)
        except KeyboardInterrupt:
            self.stdout.write(self.style.WARNING('Scheduler stopped by user'))
