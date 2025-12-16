DETAILED 8-WEEK HANDS-ON PLAN: Rebuild / Recreate the SIEM app (beginner-friendly)

Purpose
- This document turns the high-level plan into daily step-by-step actions suitable for someone with little development experience. Each day has small tasks, exact commands to run, expected outcomes, and quick debugging tips.
- Follow tasks in order. Each task is short (30–120 minutes) so you can make steady progress.

How to use this file
1. Read the Week header for context.
2. For each Day, run the commands shown in a terminal inside the project root.
3. After completing a day's tasks, mark them done in your notes and move on.
4. If you get stuck, copy error outputs and ask for help — paste the exact terminal output.

Estimated time
- Part-time (2–3 hours/day): 8–10 weeks
- Full-time: 3–4 weeks

Prerequisites (one-time before Week 1)
- Install Git, Python 3.10+, Node.js 16+, Docker (optional), VS Code
- Create a GitHub repo and clone it to your machine
- Create a directory structure: `backend/`, `frontend/`
- Open the project folder in VS Code

Common commands you'll use repeatedly
- Git status / stash / commit / push:
  - git status
  - git add -A
  - git commit -m "message"
  - git push origin <branch>
  - git stash push -u -m "wip"
  - git stash pop
- Python virtualenv and runserver:
  - python -m venv .venv
  - source .venv/bin/activate
  - pip install -r requirements.txt
  - python manage.py runserver
- Frontend dev server:
  - cd frontend
  - npm install
  - npm run dev

-------------------------
WEEK 0 (Prep, 1–3 days): repo, .gitignore, .env, editor
Goal: Prepare the repo so all future steps run smoothly.

Day 0.1 (30–60m): Initialize repo and .gitignore
- Commands:
  - git init
  - Create `.gitignore` with common entries:
    - node_modules/
    - .venv/
    - __pycache__/
    - *.pyc
    - .env
  - git add .gitignore && git commit -m "chore: add .gitignore"
- Outcome: Clean repo ignore rules.

Day 0.2 (30–60m): Create `.env.example` and local `.env`
- Create `.env.example` listing expected vars (DO NOT put secrets here):
  - DJANGO_SECRET_KEY=
  - DATABASE_URL=postgres://user:pass@localhost:5432/siem
  - ES_HOST=
  - ES_USERNAME=
  - ES_PASSWORD=
- Copy to `.env` and fill test values for local dev (not committed)
- Outcome: `.env` present for local dev.

Day 0.3 (30–60m): Editor setup
- Install VS Code extensions: Python, Pylance, ESLint, Prettier
- Optional: create `.vscode/settings.json` to set formatters
- Outcome: Comfortable editor.

-------------------------
WEEK 1 (Backend skeleton): create Django project, minimal API
Goal: Have a running Django app with a health endpoint and mock alerts endpoint.

Day 1.1 (60–120m): Python env + Django
- Commands:
  - cd backend
  - python -m venv .venv
  - source .venv/bin/activate
  - pip install --upgrade pip
  - pip install django djangorestframework python-dotenv
  - django-admin startproject siem_project .
- Outcome: Django project created and virtualenv ready.

Day 1.2 (60–90m): Add health endpoint
- Create app: `python manage.py startapp core` (or use es_integration existing folder)
- Edit `siem_project/urls.py` to include:
  - path('api/health/', lambda req: HttpResponse('ok'))
- Run server: `python manage.py runserver` and curl `http://127.0.0.1:8000/api/health/`
- Outcome: health check returns 200.

Day 1.3 (120–180m): Add REST framework and mock alerts endpoint
- Install DRF (done earlier)
- Create `es_integration` app with a view:
  - `GET /api/v1/alerts/list/` -> returns JSON list of sample alerts (tenant_id, severity, timestamp, message)
- Example minimal view (Django): create `views.py`:
  - def list_alerts(request): return JsonResponse({"alerts": []})
- Wire to `urls.py` and test with curl.
- Outcome: mock alerts endpoint returns JSON.

Acceptance criteria Week 1:
- Backend runs `python manage.py runserver`
- Health endpoint and alerts endpoint respond with 200 and JSON

-------------------------
WEEK 2 (DB models, migrations, ES mocking)
Goal: Model alerts and ES config, run migrations, seed data.

Day 2.1 (90–180m): Models & migrations
- In `es_integration/models.py` create models:
  - Alert: tenant_id (str), severity (str), timestamp (datetime), message (text), source_index (str)
  - ESIntegrationConfig: tenant_id (FK or str), hosts (text), index (str), username (nullable), password (nullable), enabled (bool)
- Commands:
  - python manage.py makemigrations
  - python manage.py migrate
- Outcome: DB tables created.

Day 2.2 (60–120m): Seed script
- Create management command `seed_demo` or `seed_tenants` that creates User(s), UserProfile, and a few Alert rows.
- Run `python manage.py seed_demo` to populate sample data.
- Outcome: DB has sample data.

Day 2.3 (60–120m): ES integration toggle & mock
- Implement service function `list_alerts_for_tenant(tenant_id, force_mock=False)`:
  - If no ES config or force_mock True -> query DB Alert model
  - Else -> call ES (later)
- Add unit test to verify it returns data from DB when force_mock True.

Acceptance criteria Week 2:
- Models created and migrations applied
- Seed data exists and APIs read from DB when mock mode

-------------------------
WEEK 3 (Auth & Security basics)
Goal: Implement user login, JWT, tenant association, secure settings

Day 3.1 (90–180m): Add Django REST Simple JWT
- pip install djangorestframework-simplejwt
- Add to settings and create `POST /api/v1/auth/login/` view using TokenObtainPairView
- Ensure `UserProfile` (tenant_id) is created when users register or seed script sets it
- Test login via curl/Postman and receive access token

Day 3.2 (60–120m): Protect endpoints
- Require authentication for alerts endpoints
- Use `permission_classes = [IsAuthenticated]` in DRF view
- Test: calling without token returns 401, with token returns 200

Day 3.3 (60–90m): Secure settings
- Ensure `DJANGO_SECRET_KEY` is read from env
- Add `python-dotenv` to load `.env` in dev
- Ensure `.env` is in .gitignore

Acceptance criteria Week 3:
- Login returns access token
- Protected endpoints require token

-------------------------
WEEK 4 (Frontend skeleton: React + TypeScript)
Goal: Setup frontend, implement login form, basic layout and routing

Day 4.1 (60–120m): Create frontend app
- Commands:
  - cd frontend
  - npm create vite@latest . --template react-ts
  - npm install
  - npm i antd axios react-router-dom @ant-design/icons
- Outcome: dev server runs `npm run dev`

Day 4.2 (90–180m): Build LoginForm component
- Create `src/components/LoginForm.tsx` using AntD Form
- Implement API call to `POST /api/v1/auth/login/` via axios
- On success: save `access` token to localStorage key `siem_access_token` and tenant to `siem_tenant_id`
- Redirect to main App shell

Day 4.3 (90–180m): App shell and routing
- Implement `App.tsx` with routes: /dashboard, /alerts, /tickets
- Protect routes: if no token -> render LoginForm
- Implement `api.ts` wrapper for axios that injects Authorization header

Acceptance criteria Week 4:
- Frontend can log in and show protected pages

-------------------------
WEEK 5 (API integration & Dashboard)
Goal: Fetch data, display charts, handle refresh/polling

Day 5.1 (120–240m): API client
- Create `frontend/src/api.ts`:
  - axios instance with baseURL
  - request interceptor to add `Authorization: Bearer <token>` from localStorage
  - response interceptor to handle 401 (redirect to login)

Day 5.2 (120–240m): Implement Dashboard UI
- Create Dashboard component
  - Use AntD Card, Statistic components
  - Implement charts (AntD Charts) for source_index pie, daily trend line, top messages column
  - Show loading states
- Fetch `/api/v1/alerts/dashboard/` and render

Day 5.3 (60–120m): Caching and polling
- Implement local cache (localStorage with timestamp) for dashboard data
- Poll every 30s only when tab visible (use Page Visibility API)

Acceptance criteria Week 5:
- Dashboard shows live/seeded data with charts and caching

-------------------------
WEEK 6 (Testing & CI)
Goal: Add tests and CI pipeline for linting and running tests

Day 6.1 (120–240m): Backend tests
- Create tests in `backend/es_integration/tests.py` covering:
  - list_alerts_for_tenant (mock path)
  - auth endpoints (login)
- Run `python manage.py test`

Day 6.2 (120–240m): Frontend tests
- Install jest and React Testing Library
- Add basic tests for LoginForm and Dashboard rendering

Day 6.3 (60–120m): CI (GitHub Actions) - basic workflow
- Create `.github/workflows/ci.yml` with jobs:
  - checkout, setup python, install deps, run backend tests
  - setup node, install, run frontend tests/build
- Add lint steps (flake8/ruff and ESLint)

Acceptance criteria Week 6:
- CI runs on PR and passes tests and lint

-------------------------
WEEK 7 (Docker & Staging deployment)
Goal: Containerize and deploy to staging (local docker-compose)

Day 7.1 (120–240m): Dockerfiles
- Backend Dockerfile example:
  - FROM python:3.11-slim
  - WORKDIR /app
  - COPY backend/requirements.txt .
  - RUN pip install -r requirements.txt
  - COPY backend/ .
  - CMD ["gunicorn", "siem_project.wsgi:application", "-b", "0.0.0.0:8000"]
- Frontend Dockerfile
  - build with npm run build and serve static files (nginx or serve)

Day 7.2 (60–180m): docker-compose
- Compose file with services: db (postgres), web (backend), frontend, redis (optional), es (optional)
- `docker-compose up --build`

Day 7.3 (60–180m): Staging smoke test
- Curl health endpoint, login and fetch dashboard
- Run `python manage.py migrate --noinput` in container

Acceptance criteria Week 7:
- Staging via docker-compose runs and responds to requests

-------------------------
WEEK 8 (Production hardening)
Goal: TLS, secrets, backups, monitoring

Day 8.1 (120–240m): Secrets and env
- Use GitHub Secrets, or cloud provider secret manager
- Remove `.env` from servers; use env injection in orchestration

Day 8.2 (120–240m): TLS and reverse proxy
- Use nginx or cloud load balancer with LetsEncrypt Certbot
- Enable HSTS, redirect HTTP->HTTPS

Day 8.3 (120–240m): Monitoring and backups
- Add Sentry for error tracking
- Add periodic Postgres backup cron job (pg_dump to object storage)

Acceptance criteria Week 8:
- Production environment with TLS, secrets managed, backups scheduled

-------------------------
DOCUMENTATION, RUNBOOKS, AND ONGOING MAINTENANCE
- README: how to setup dev, run tests, build, deploy
- API docs: use DRF's schema + Swagger UI
- Runbook: steps for rollback, DB restore, emergency contact

-------------------------
DETAILED ACTION ITEMS / CODE SNIPPETS (copy/paste safe)

A: Create Django project and app (exact commands)
```bash
mkdir siem-project && cd siem-project
python -m venv .venv
source .venv/bin/activate
pip install django djangorestframework python-dotenv
django-admin startproject siem_project backend/siem_project
cd backend
python manage.py startapp es_integration
python manage.py migrate
python manage.py runserver
```

B: Minimal `es_integration/views.py` (example)
```py
from django.http import JsonResponse
from django.views.decorators.http import require_GET

@require_GET
def list_alerts(request):
    data = [{"tenant_id": "tenant_a", "severity": "Critical", "timestamp": "2025-11-18T00:00:00", "message": "sample"}]
    return JsonResponse({"alerts": data})
```

C: Frontend: create vite app
```bash
cd frontend
npm create vite@latest . -- --template react-ts
npm install
npm i antd axios react-router-dom @ant-design/icons
npm run dev
```

D: Axios wrapper (src/api.ts)
```ts
import axios from 'axios';
const api = axios.create({ baseURL: process.env.VITE_API_BASE || 'http://localhost:8000' });
api.interceptors.request.use((cfg) => {
  const token = localStorage.getItem('siem_access_token');
  if (token) cfg.headers['Authorization'] = `Bearer ${token}`;
  return cfg;
});
export default api;
```

-------------------------
TROUBLESHOOTING QUICK REFERENCE
- "ModuleNotFoundError" for Django packages: activate virtualenv and `pip install -r requirements.txt`
- Frontend dev server fails: remove node_modules and reinstall (`rm -rf node_modules && npm install`)
- Git branch errors (non-fast-forward): stash, pull --rebase, then apply stash

-------------------------
RESOURCES & LEARNING LINKS
- Django: https://docs.djangoproject.com/zh-hans/
- DRF: https://www.django-rest-framework.org/
- React + TypeScript: https://reactjs.org/ and https://www.typescriptlang.org/
- Vite: https://vitejs.dev/
- Docker: https://docs.docker.com/
- GitHub Actions: https://docs.github.com/en/actions

-------------------------
NEXT STEP (if you want):
- I can convert this file into a day-by-day checklist CSV that you can import into GitHub Issues or a task manager.
- Or I can generate the initial backend skeleton files for you (create manage.py, settings, basic views) and run quick tests locally (I can produce patches you can apply).

If you want the CSV / GitHub Issues export or immediate skeleton, say which and I'll produce it.