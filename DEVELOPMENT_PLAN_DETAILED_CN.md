详细 8 周实操计划：从零构建 SIEM 应用（中文）

目的
- 把之前的英文计划翻译为面向完全没有开发经验者的中文逐日操作手册。
- 每日给出小任务、精确命令、预期结果与调试提示，便于按部就班完成项目重写或复刻。

使用说明
1. 按周顺序执行，先阅读每周目标与每日任务。
2. 在终端中按文中命令执行（项目根目录）。
3. 完成每日任务后记录进度；遇到问题把终端输出复制过来寻求帮助。

预计耗时
- 兼职（每天2–3小时）：8–10 周
- 全职：3–4 周

前置准备（开始前完成）
- 安装：Git、Python 3.10+、Node.js 16+、Docker（可选）、VS Code
- 创建并克隆 Git 仓库
- 在本地创建目录结构：`backend/` 和 `frontend/`
- 在 VS Code 中打开项目，安装插件：Python、ESLint、Prettier

常用命令（重复使用）
- Git：
  - git status
  - git add -A; git commit -m "msg"; git push origin <branch>
  - git stash push -u -m "wip"; git stash pop
- Python：
  - python -m venv .venv
  - source .venv/bin/activate
  - pip install -r requirements.txt
  - python manage.py runserver
- 前端：
  - cd frontend; npm install; npm run dev

第 0 周（准备，1–3 天）
目标：准备开发环境、仓库与编辑器配置

Day 0.1：初始化仓库与 .gitignore（30–60 分）
- 在仓库根创建 `.gitignore`，包含：
  - node_modules/
  - .venv/
  - __pycache__/ 和 *.pyc
  - .env
- 命令：
  - git init
  - git add .gitignore && git commit -m "chore: add .gitignore"

Day 0.2：创建 `.env.example` 与本地 `.env`（30–60 分）
- 在 `.env.example` 列出需要的变量（不要放真实密钥）
  - DJANGO_SECRET_KEY=
  - DATABASE_URL=
  - ES_HOST= 等
- 本地复制 `.env` 并填写测试值（不要提交）

Day 0.3：编辑器设置（30–60 分）
- VS Code：安装 Python、Pylance、ESLint、Prettier
- 可添加 `.vscode/settings.json` 以统一格式化设置

第 1 周（后端骨架）
目标：创建 Django 项目、虚拟环境，添加健康检查与 mock API

Day 1.1：虚拟环境与 Django（60–120 分）
- 进入 backend 目录并创建虚拟环境：
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install django djangorestframework python-dotenv
django-admin startproject siem_project .
```
- 预期：能运行 `python manage.py runserver`

Day 1.2：添加健康检查接口（60–90 分）
- 在 `siem_project/urls.py` 添加：
```py
from django.http import HttpResponse
path('api/health/', lambda req: HttpResponse('ok'))
```
- 启动服务并访问 `http://127.0.0.1:8000/api/health/`，应返回 200/ok

Day 1.3：实现 mock alerts API（120–180 分）
- 新建 app（如果没有）：`python manage.py startapp es_integration`
- 在 `es_integration/views.py` 添加简单的 JSON 返回：
```py
from django.http import JsonResponse

def list_alerts(request):
    data = [{"tenant_id":"tenant_a","severity":"Critical","timestamp":"2025-11-18T00:00:00","message":"sample"}]
    return JsonResponse({"alerts": data})
```
- 在 urls 中挂载路由并用 curl 测试

第 2 周（数据库模型与迁移）
目标：建立 Alert 和 ES 配置模型并写种子脚本

Day 2.1：创建模型并迁移（90–180 分）
- 在 `es_integration/models.py` 定义：
  - Alert（tenant_id, severity, timestamp, message, source_index）
  - ESIntegrationConfig（tenant_id, hosts, index, username, password, enabled）
- 命令：
  - python manage.py makemigrations
  - python manage.py migrate

Day 2.2：编写 seed 脚本（60–120 分）
- 新建管理命令 `seed_demo`，向 DB 写入示例用户、UserProfile 和若干 Alerts
- 运行 `python manage.py seed_demo` 验证

Day 2.3：实现服务层 mock/ES 切换（60–120 分）
- 编写 `list_alerts_for_tenant(tenant_id, force_mock=False)`，在没有 ES 配置时查询 DB
- 添加单元测试验证 mock 路径

第 3 周（认证与安全）
目标：实现登录（JWT）、权限保护与安全配置

Day 3.1：安装并配置 Simple JWT（90–180 分）
- pip install djangorestframework-simplejwt
- 在 settings 配置 JWT，并创建登录接口（TokenObtainPairView）
- 测试：POST /api/v1/auth/login/ 返回 access/refresh token

Day 3.2：保护 API（60–120 分）
- 使用 DRF 的 `IsAuthenticated` 保护 alerts 接口
- 无 token 返回 401，有 token 返回数据

Day 3.3：安全设置（60–90 分）
- 从环境读取 `DJANGO_SECRET_KEY`，使用 python-dotenv 在本地加载 .env
- 确保 .env 被忽略（不提交）

第 4 周（前端骨架）
目标：创建 React + TypeScript 前端，登录表单与基本布局

Day 4.1：创建前端项目（60–120 分）
```bash
cd frontend
npm create vite@latest . --template react-ts
npm install
npm i antd axios react-router-dom @ant-design/icons
npm run dev
```
- 预期：浏览器打开开发服务器

Day 4.2：实现 LoginForm（90–180 分）
- 使用 Ant Design Form，提交登录接口，成功后把 token 存到 localStorage（`siem_access_token`）和 tenant（`siem_tenant_id`）

Day 4.3：App shell 与路由（90–180 分）
- 实现 `App.tsx`，包含 Header、Tabs（或 Menu），路由 /dashboard /alerts /tickets
- 若无 token 显示登录页

第 5 周（接口联调与 Dashboard）
目标：实现前端 API client、图表展示、缓存与轮询

Day 5.1：API 客户端（120–240 分）
- 编写 `frontend/src/api.ts`：axios 实例，request 拦截器注入 `Authorization: Bearer <token>`，response 拦截器处理 401

Day 5.2：Dashboard UI（120–240 分）
- 使用 AntD Card、Statistic、AntD Charts 实现饼图、折线图、柱状图
- 请求后端 `GET /api/v1/alerts/dashboard/` 并渲染

Day 5.3：缓存与可见性轮询（60–120 分）
- 使用 localStorage 缓存最近一次成功响应并加时间戳
- 只在 document.visibilityState === 'visible' 时轮询（每 30s）

第 6 周（测试与 CI）
目标：添加单元测试并配置 GitHub Actions 流水线

Day 6.1：后端测试（120–240 分）
- 编写 Django tests（用户登录、list_alerts_for_tenant mock 路径）
- 运行 `python manage.py test`

Day 6.2：前端测试（120–240 分）
- 安装 Jest + React Testing Library，写 LoginForm 和 Dashboard 的渲染测试

Day 6.3：CI（60–120 分）
- 创建 `.github/workflows/ci.yml`：执行 linters、运行后端/前端测试、前端构建

第 7 周（容器化与 Staging）
目标：Docker 化并用 docker-compose 在本地/测试环境跑一套

Day 7.1：后端/前端 Dockerfile（120–240 分）
- 后端使用 gunicorn，前端构建静态并用 nginx 托管

Day 7.2：docker-compose（60–180 分）
- services: db(postgres), web(backend), frontend, redis (可选), es (可选)
- 运行 `docker-compose up --build`

Day 7.3：Smoke test（60–120 分）
- 在容器中运行 `python manage.py migrate` 并 curl 健康检查、登录、请求 dashboard

第 8 周（生产硬化）
目标：TLS、Secret 管理、监控、备份

Day 8.1：Secret 管理（120–240 分）
- 在生产用 Secret Manager（云服务或 HashiCorp Vault），不把密钥写入仓库

Day 8.2：TLS 与反向代理（120–240 分）
- 使用 nginx 反代并申请 Let’s Encrypt 证书
- 强制 HTTPS、启用 HSTS

Day 8.3：监控与备份（120–240 分）
- 集成 Sentry、设置 Postgres 备份（pg_dump 到对象存储）

验收清单（发布前）
- 所有 secrets 不在仓库，使用 env/secret manager
- HTTPS 启用
- 自动化测试通过
- 监控与备份已配置

调试要点（常见问题与命令）
- Python 包缺失：激活虚拟环境并 `pip install -r requirements.txt`
- 前端依赖问题：删除 node_modules 重装 `npm ci`
- Git 报错（non-fast-forward）：`git pull --rebase` 或 stash + pull

后续（我可以继续帮你）
- 把本计划导出为 CSV，便于导入 GitHub Issues
- 基于你当前仓库自动生成后端 skeleton 或前端骨架并提交为分支

是否要我把这个中文详细计划导出为 CSV（每行一项）以便你导入到任务管理工具？或者我现在直接基于第 1 周生成可执行脚本 `setup_dev_env.sh`？请回复“CSV”或“脚本”或告诉我你想先做哪一天的任务，我会把精确命令给你。