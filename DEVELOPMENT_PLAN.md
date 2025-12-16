# 完整从 0 到 生产：手把手把现有 SIEM 应用重写 / 复刻 的 6–8 周计划

目标：为没有开发经验的人提供一套可操作、按周拆分的计划，包含前端/后端/数据库/测试/CI/CD/部署/安全等全生命周期的步骤、命令示例与参考资料。

大致时长：6–8 周（可扩展到 10 周），每天 2–4 小时可完成基础版，若全职可更快。

---

## 前置条件（你需要先准备/学习的东西）
- 基本命令行使用（cd / ls / mkdir / git / curl）
- 基础编程常识（变量、函数、HTTP）—— 不强制，但会加速
- 安装：
  - Git (版本控制)
  - Python 3.10+ (后端)
  - Node.js 16+ / npm 或 pnpm (前端)
  - Docker (推荐，但可选)
  - Postgres（本地或 Docker）
  - 编辑器：VS Code（推荐）
- 帐号：GitHub（或任何 Git 托管），以及可选的云服务（Heroku/GCP/AWS/DO）

推荐快速学习资源：
- Git 简明教程：https://rogerdudler.github.io/git-guide/index.zh.html
- Python 入门（官方）：https://docs.python.org/3/tutorial/
- React + TypeScript 入门教程（官方/社区）

---

## 约定与最佳实践（从一开始就遵守）
- 所有机密使用环境变量（.env 本地文件仅用于开发，需加入 `.gitignore`）。
- 不要把编译产物、虚拟环境、数据库文件和 `.pyc` 提交到仓库（.gitignore）。
- 使用 linters：Python 用 flake8/ruff、JS/TS 用 ESLint/Prettier。
- 使用测试：后端用 pytest 或 Django tests，前端用 jest + react-testing-library。
- 在远端分支上做开发（feature branches），PR -> code review -> merge 到 main。

---

## 工具与模板（推荐）
- 后端：Django + Django REST Framework
- 前端：React + TypeScript + Ant Design（你现有项目里已使用）
- 数据库：Postgres
- 任务队列（可选）：Redis + Celery
- 本地运行：Docker Compose（可选但能简化依赖）
- CI：GitHub Actions
- 安全扫描：Bandit (Python), npm audit / Snyk

---

## 周计划（细化到每周/每天）
说明：每周给出目标与每日任务。每天的时间可调整。

### 第 0 周（准备，1-3 天）—— 环境准备与 repo 初始化
目标：准备好工作环境、克隆仓库并能运行最小示例。

任务：
- 安装 Git、Python、Node、Docker。
- 克隆仓库：
  ```bash
  git clone https://github.com/<your-org>/SIEM.git
  cd SIEM
  ```
- 在项目根创建 `.env.example` 并把敏感变量放入 `.env`（本机开发用）：
  - `DJANGO_SECRET_KEY`、`DATABASE_URL`、`POSTGRES_USER`、`POSTGRES_PASSWORD`、`ES_HOST`、`ES_USERNAME`、`ES_PASSWORD` 等。
- 确保 `.gitignore` 包含 `__pycache__/`, `*.pyc`, `node_modules/`, `.env` 等。
- 在 README 记录本地快速启动命令（下一周会填充）。

输出/验收：能运行 `git status`，并有 `.env`（未提交到远端）。

---

### 第 1 周（后端基础）
目标：建立 Django 项目基础、虚拟环境、并实现最小 REST API（健康检查、示例 endpoint）。

每日任务建议：
- Day 1: 新建 Python 虚拟环境并安装依赖
  ```bash
  python -m venv .venv
  source .venv/bin/activate
  pip install --upgrade pip
  pip install django djangorestframework psycopg2-binary python-dotenv
  ```
- Day 2: 创建 Django 项目/应用
  ```bash
  django-admin startproject siem_project backend/siem_project
  cd backend
  python manage.py startapp es_integration
  ```
- Day 3: 配置 settings（从 `.env` 读取），连接 Postgres（或 sqlite 临时）
  - 使用 `DJANGO_SECRET_KEY = os.environ['DJANGO_SECRET_KEY']`，并提供开发时的生成方法。
- Day 4: 添加简单的 `GET /api/health/` 和 `GET /api/alerts/`（mock 返回）
- Day 5: 确保后端能启动 `python manage.py runserver` 并返回健康检查。

验收：`curl http://127.0.0.1:8000/api/health/` 返回 200。

文档/参考：
- Django 官方教程：https://docs.djangoproject.com/zh-hans/4.2/intro/
- DRF 入门：https://www.django-rest-framework.org/

---

### 第 2 周（数据库建模与 ES 集成基础）
目标：设计数据模型、实现 migrations、准备 ES 查询或 mock 逻辑。

任务：
- Day 1: 设计数据库表（alerts、users profiles、es_integration config、webhook config 等），编写 Django models。
- Day 2: 运行 `makemigrations` / `migrate`，编写管理命令或脚本来 seed 测试数据。
  ```bash
  python manage.py makemigrations
  python manage.py migrate
  python manage.py loaddata initial_data.json  # 或自写脚本
  ```
- Day 3: 如果你要对接 Elasticsearch：
  - 先实现一个可切换的模式 `mock` vs `es`，在没有 ES 时用本地 mock。
  - 如果有 ES，可用 `elasticsearch` Python 库或 HTTP (注意认证)；把认证信息存入 `ESIntegrationConfig`。
- Day 4–5: 实现一个后台服务方法 `list_alerts_for_tenant(tenant_id)`，先返回 mock。写单元测试覆盖它。（pytest 或 Django tests）

验收：能通过 API 获取 alerts 列表（含 mock），并且 migrations 能正确执行。

安全注意：不要把 ES 的用户名/密码写入代码，使用环境变量或 DB 的加密字段与访问控制。

---

### 第 3 周（认证、用户管理与安全）
目标：实现登录、JWT、权限、以及基本安全设置。

任务：
- Day 1: 安装并配置 `djangorestframework_simplejwt`，实现 `POST /api/v1/auth/login/`，返回 access/refresh token。
- Day 2: 实现用户/tenant 的关联模型（UserProfile），并在登录时返回 tenant_id。
- Day 3: 前端使用 access token 存储（localStorage）并在请求头 Authorization: Bearer <token>。
- Day 4: 实现 logout（前端清除 token），并在后端短期验证 token 过期。
- Day 5: 配置 CORS（django-cors-headers），CSRF 等必要的安全中间件。

验收：能在 Postman 或前端登录并访问受保护的 API。

安全最佳实践：
- 密码使用 Django 的内置哈希（PBKDF2）、不要自实现。
- Token 存储注意：access 存 localStorage（短寿命），refresh 存安全策略中（或 httpOnly cookie 更安全）。

---

### 第 4 周（前端基础与框架搭建）
目标：建立 React + TypeScript 前端骨架，实现登录表单、基础布局与路由。

任务：
- Day 1: 创建前端项目（Vite 推荐）
  ```bash
  npm create vite@latest frontend --template react-ts
  cd frontend
  npm install
  ```
- Day 2: 安装 UI 库（Ant Design）、React Router、axios（或 fetch wrapper）
  ```bash
  npm i antd @ant-design/icons axios react-router-dom
  ```
- Day 3: 实现 `LoginForm` 组件，调用后端登录 API，保存 token 到 localStorage。
- Day 4: 实现 App 布局（Header、Tabs 或 Menu）和占位页面（Dashboard、Alerts、Tickets）。
- Day 5: 在 Dashboard 页面显示 mock 数据；确保跨域（CORS）配置正确。

验收：能在浏览器登录并看到主页面（即 token 验证成功并渲染路由）。

---

### 第 5 周（前后端联调、核心功能实现）
目标：实现前端调用后端 API 展示真实/模拟数据，完善 Dashboard 核心功能。

任务：
- Day 1–2: 定义 API client（封装 axios），处理 Authorization header 自动注入、错误拦截（401 -> redirect to login）。
- Day 3–4: 实现 Dashboard 各个图表（AntD Charts/Plots 或 ECharts），先基于 mock，再接入后端。
- Day 5: 处理刷新时的 token 恢复（localStorage）与 loading 状态，避免闪烁登录框（参照你之前的改动）。

验收：Dashboard 能正确显示后端返回的数据，前端有良好 loading/错误处理逻辑。

---

### 第 6 周（测试、质量与 CI）
目标：为后端和前端添加自动化测试和 CI 流水线，确保代码质量。

任务：
- Day 1–2: 为后端添加单元测试（Django TestCase 或 pytest-django），覆盖关键逻辑。
- Day 3–4: 为前端添加 Jest + React Testing Library 测试（组件渲染、api mock）。
- Day 5: 配置 GitHub Actions：
  - 步骤：checkout → setup python/node → install dependencies → run linters → run tests → build frontend。
  - 添加 Bandit 扫描（后端）和 npm audit（前端）。

验收：PR 时 CI 能自动运行并绿灯通过（lint & tests）。

---

### 第 7 周（部署到 staging / infra）
目标：准备部署，使用 Docker/Docker Compose（或 PaaS）部署到 staging 环境。

任务：
- Day 1: 写 `Dockerfile`（后端）和 `Dockerfile`（前端），以及 `docker-compose.yml`（db + redis + es optional）。
- Day 2: 在本地用 `docker-compose up --build` 测试部署。
- Day 3: 将 docker 镜像推到镜像仓库（Docker Hub / GHCR）。
- Day 4: 在云端（或 VPS）部署 staging：拉镜像、设置环境变量、运行迁移 `python manage.py migrate`、收集静态文件 `collectstatic`。
- Day 5: 运行一次线上 smoke test（curl 健康检查，登录并请求 dashboard）。

验收：staging 环境能对外访问并正常工作。

---

### 第 8 周（生产准备与硬化）
目标：生产级别安全、监控、备份与自动化。

任务：
- Day 1: 配置 HTTPS（TLS）与负载均衡（Cloud Load Balancer / Nginx + Certbot）。
- Day 2: 配置 secrets 管理（Vault / cloud secret manager / GitHub Secrets），不在仓库里保存 secrets。
- Day 3: 设置日志与监控（Prometheus + Grafana 或 Sentry / Papertrail）。
- Day 4: 备份策略（定期备份 Postgres 数据、ES 快照）。
- Day 5: 生产级安全扫描（Bandit、依赖漏洞扫描），并修复高风险项目。

验收：生产服务运行稳定、可被监控、定期备份、且对外使用 HTTPS。

---

## 每日/每任务的常用命令清单（拷贝粘贴使用）
- 启动后端（开发）：
  ```bash
  cd backend
  source .venv/bin/activate
  export DJANGO_SECRET_KEY="dev-key"
  export DATABASE_URL=postgres://user:pass@localhost:5432/siem_dev
  python manage.py runserver
  ```
- 启动前端（开发）：
  ```bash
  cd frontend
  npm install
  npm run dev
  ```
- Docker Compose 本地：
  ```bash
  docker-compose up --build
  ```
- 运行后端测试：
  ```bash
  cd backend
  python manage.py test
  ```
- 运行前端测试：
  ```bash
  cd frontend
  npm test
  ```

---

## 安全清单（发布前逐项验证）
- [ ] 所有 secrets 存在环境变量或 secret manager，不在仓库中
- [ ] HTTPS 强制（HSTS）
- [ ] 密码哈希/轮替策略
- [ ] 输入验证（后端）与输出编码（前端）避免 XSS
- [ ] SQL 注入防护（使用 ORM 和参数化查询）
- [ ] CSRF / CORS 正确配置
- [ ] 依赖漏洞扫描（Bandit + npm audit/Snyk）
- [ ] 日志不包含敏感信息（不要打印明文密码/API keys）

---

## 生产运营与维护
- 监控：错误（Sentry）、性能（APM）、系统（Prometheus/Grafana）
- 备份：自动化 DB 备份并测试恢复策略
- 事故响应：写 runbook，包含如何回滚、如何恢复 DB、如何撤回配置变更

---

## 参考与学习资料
- Django docs: https://docs.djangoproject.com/zh-hans/
- Django REST Framework: https://www.django-rest-framework.org/
- Simple JWT: https://django-rest-framework-simplejwt.readthedocs.io/
- React + TypeScript + Vite: https://vitejs.dev/guide/
- Ant Design: https://ant.design/
- Docker 入门: https://docs.docker.com/get-started/
- Postgres 官方: https://www.postgresql.org/docs/
- Security: OWASP Top 10: https://owasp.org/www-project-top-ten/
- Bandit (Python security scanner): https://bandit.readthedocs.io/

---

## 附录：对新手的具体建议
- 每天把任务拆成小块（30–90 分钟），并在完成后写下“今天完成了什么、遇到什么问题、明天做什么”。
- 多用 README.md 保存操作步骤，当遇到问题时先查 README，再问人。
- 版本控制：频繁 commit（小步提交），push 到远端分支，发 PR 请求 review。

---

如果你愿意，我可以：
- 把上面的每一周拆成更细的每日 checklist，并把它导入为任务（例如写成 GitHub Issues 或本地 Todo）。
- 依据你当前仓库的实际结构（我可以查看项目里的文件），把任务直接映射到具体文件/函数需要修改的清单。

想要我把本计划转换为每日任务（例如 8 周 × 5 天 × 具体工作项）并写成 CSV 或 GitHub Issues 批量导入吗？告知你的偏好，我继续细化。