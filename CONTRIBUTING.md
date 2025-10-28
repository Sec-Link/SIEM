# Contribution Guidelines

This project is a multi-tenant SIEM platform with both backend and frontend collaboration. The following guidelines help team members understand their responsibilities and the development process.

## Project Structure
```
SIEM/
├── backend/   # Django backend
│   ├── .venv/         # Virtual environment (optional, may not exist in all setups)
│   ├── README.md      # Backend-specific documentation
│   ├── db.sqlite3     # SQLite database file (for development)
│   ├── manage.py      # Django's command-line utility
│   ├── requirements.txt # Python dependencies
│   ├── siem_project/  # Main Django project folder
│   │   ├── __init__.py
│   │   ├── settings.py # Global settings for the project
│   │   ├── urls.py     # URL routing for the project
│   │   ├── wsgi.py     # WSGI entry point for deployment
│   ├── users/         # User management app
│   ├── es_integration/ # Elasticsearch integration app
│   ├── ticketing/     # Ticketing system app
├── frontend/  # React frontend
│   ├── README.md       # Frontend-specific documentation
│   ├── node_modules/   # Dependencies (auto-generated, do not modify manually)
│   ├── package.json    # Project metadata and dependencies
│   ├── package-lock.json # Dependency lock file
│   ├── public/         # Static files (e.g., index.html)
│   ├── src/            # Source code
│   │   ├── App.tsx     # Main application component
│   │   ├── api.ts      # API interaction logic
│   │   ├── components/ # Reusable components
│   │   │   ├── AlertList.tsx  # Alert list component
│   │   │   ├── Dashboard.tsx  # Dashboard component
│   │   │   ├── LoginForm.tsx  # Login form component
│   │   │   ├── TicketList.tsx # Ticket list component
│   │   ├── index.tsx   # Entry point for the React app
│   │   ├── types.ts    # TypeScript type definitions
│   ├── tsconfig.json   # TypeScript configuration
│   ├── webpack.config.js # Webpack configuration for bundling
```

## Responsibilities

### 1. User Management Module (users)
**Owner**: Developer A
- **Features**:
  - User registration, login, and logout.
  - JWT authentication.
  - Multi-tenancy support.
- **Frontend-Backend Interaction**:
  - Login API: `POST /auth/login/`
  - Registration API: `POST /auth/register/`

### 2. Alert Management Module (alerts)
**Owner**: Developer B
- **Features**:
  - Alert creation, retrieval, and pagination.
  - Alert filtering and search.
- **Frontend-Backend Interaction**:
  - Get alert list: `GET /alerts/list/`
  - Create alert: `POST /alerts/`

### 3. Ticket Management Module (tickets)
**Owner**: Developer C
- **Features**:
  - Ticket creation, assignment, and status updates.
  - Ticket history tracking.
- **Frontend-Backend Interaction**:
  - Get ticket list: `GET /tickets/`
  - Create ticket: `POST /tickets/`

### 4. Dashboard Module (dashboard)
**Owner**: Developer B
- **Features**:
  - Data visualization.
  - Interaction with Elasticsearch.

## Dashboard Module Details

### Elasticsearch Configuration
1. **Install and Configure Elasticsearch**:
   - Download and install Elasticsearch.
   - Modify the `elasticsearch.yml` configuration file with the following settings:
     ```yaml
     network.host: 0.0.0.0
     http.port: 9200
     ```
   - Start Elasticsearch:
     ```bash
     ./bin/elasticsearch
     ```

2. **Create Index**:
   - Use the following command to create an index:
     ```bash
     curl -X PUT "http://localhost:9200/alerts" -H 'Content-Type: application/json' -d'{
       "mappings": {
         "properties": {
           "timestamp": { "type": "date" },
           "severity": { "type": "keyword" },
           "message": { "type": "text" }
         }
       }
     }'
     ```

3. **Insert Test Data**:
   - Use the following command to insert data:
     ```bash
     curl -X POST "http://localhost:9200/alerts/_doc" -H 'Content-Type: application/json' -d'{
       "timestamp": "2025-10-17T12:00:00",
       "severity": "high",
       "message": "CPU usage exceeded threshold"
     }'
     ```

### Frontend Interaction with Elasticsearch
1. **API Calls**:
   - The frontend calls backend APIs via the `api.ts` file.
   - Example:
     ```typescript
     export async function fetchDashboardData() {
       const res = await client.get('/alerts/dashboard/');
       return res.data;
     }
     ```

2. **Data Display**:
   - Use Ant Design's `Table` and `Chart` components to display data.
   - Example:
     ```tsx
     <Table dataSource={data} columns={columns} />
     ```

### Binding the Dashboard App with Elasticsearch

To bind the dashboard app with Elasticsearch, follow these steps:

1. **Configure Backend Integration**:
   - Ensure the backend is set up to interact with Elasticsearch. Update the `settings.py` file to include the Elasticsearch host:
     ```python
     ELASTICSEARCH_DSL = {
         'default': {
             'hosts': 'localhost:9200'
         }
     }
     ```
   - Install the required Python package for Elasticsearch:
     ```bash
     pip install elasticsearch-dsl
     ```
   - Create a service in the backend to fetch data from Elasticsearch. Example:
     ```python
     from elasticsearch_dsl import Search

     def fetch_alerts_from_elasticsearch():
         s = Search(index="alerts")
         response = s.execute()
         return response
     ```

2. **Frontend API Integration**:
   - Ensure the frontend calls the backend API to fetch Elasticsearch data. Example:
     ```typescript
     export async function fetchDashboardData() {
       const res = await client.get('/alerts/dashboard/');
       return res.data;
     }
     ```

### Developing and Extending the Dashboard

To develop and add new features to the dashboard, follow these guidelines:

1. **Understand the Current Structure**:
   - The dashboard is implemented in the `Dashboard` component located in `frontend/src/components/Dashboard.tsx`.
   - It uses Ant Design components for UI and interacts with the backend via `api.ts`.

2. **Add New Visualizations**:
   - Use libraries like `Ant Design Charts` or `Recharts` to add new visualizations.
   - Example of adding a bar chart:
     ```tsx
     import { Bar } from '@ant-design/plots';

     const data = [
       { type: 'High', value: 40 },
       { type: 'Medium', value: 30 },
       { type: 'Low', value: 20 },
     ];

     const config = {
       data,
       xField: 'value',
       yField: 'type',
       seriesField: 'type',
     };

     return <Bar {...config} />;
     ```

3. **Add New API Endpoints**:
   - If new data is required, add corresponding endpoints in the backend. Example:
     ```python
     @api_view(['GET'])
     def get_dashboard_metrics(request):
         data = fetch_alerts_from_elasticsearch()
         return Response(data)
     ```

4. **Test Your Changes**:
   - Ensure all new features are tested thoroughly.
   - Use tools like Jest for frontend testing and Django’s test framework for backend testing.

5. **Document Your Changes**:
   - Update the `CONTRIBUTING.md` file with details about the new features and how to use them.

By following these steps, you can successfully bind the dashboard app with Elasticsearch and extend its functionality.

## Development Workflow
1. **Pull the Latest Code**:
   ```bash
   git pull origin main
   ```
2. **Create a New Branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Commit Changes**:
   ```bash
   git add .
   git commit -m "Clear and descriptive commit message"
   git push origin feature/your-feature-name
   ```
4. **Create a Pull Request**:
   - Create a PR on GitHub and notify the relevant owner for code review.

## Notes
- Ensure your code adheres to the project's coding standards.
- Run tests before committing to ensure code correctness.
- Avoid committing unnecessary files like `node_modules`.

---

If you have any questions, contact the project owner.

---

## Local development & useful notes

These are pragmatic, up-to-date instructions to run the project locally and speed up debugging.

### Backend (Django)

1. Create and activate a virtual environment (recommended):

   ```bash
   python -m venv .venv
   source .venv/bin/activate
   pip install -r backend/requirements.txt
   ```

2. Run migrations and start the dev server:

   ```bash
   cd backend
   python manage.py migrate
   python manage.py runserver 8000
   ```

3. Useful management commands:

   - Create superuser: `python manage.py createsuperuser`
   - Run tests: `python manage.py test`

### Frontend (React + TypeScript)

1. Install dependencies and start the dev server:

   ```bash
   cd frontend
   npm install
   npm start
   ```

   If `npm start` fails because port 3000 is in use, either stop the process using the port or start on a different port:

   - Find the PID using the port (macOS / Linux):
     ```bash
     lsof -i :3000
     kill <PID>
     ```

   - Or start on a different port without killing processes:
     ```bash
     PORT=3001 npm start
     ```

2. Build for production:

   ```bash
   npm run build
   ```

3. Tests and linters:

   - Run unit tests: `npm test` (Jest)
   - Run TypeScript checks: `npm run typecheck` (if configured)
   - Run lint: `npm run lint`

### API client and token persistence

The frontend persists authentication tokens and some cached UI data in localStorage to improve UX and avoid being logged out on refresh. Current keys used by the app:

- `siem_access_token` — the JWT/access token stored after login
- `siem_tenant_id` — tenant id associated with the login
- `siem_dashboard_cache_v1` — cached dashboard payload used to avoid blanking while the UI reloads

When adding or changing authentication logic, update `frontend/src/api.ts` and `frontend/src/components/LoginForm.tsx` accordingly.

### Mock vs ES mode (how to test both)

The dashboard and alert list support three modes: `auto`, `es`, and `mock`.

- `auto` (default): the backend will use configured ES for the tenant when available, otherwise it falls back to mock data.
- `es` / `force_es`: force the backend to query Elasticsearch (useful when you want to verify ES-backed results).
- `mock`: force the backend to return the bundled mock data (useful for UI development when ES is not available).

From the frontend, the UI appends query params to backend calls to force a mode. Example endpoints:

- Dashboard (mock): `GET /api/v1/es/dashboard/?mock=1`
- Dashboard (force ES): `GET /api/v1/es/dashboard/?force_es=1`
- Alerts list: `GET /api/v1/alerts/list/?mock=1` (Alert list view now respects the `mock` and `force_es` query params)

When configuring ES for a tenant, ensure documents in the configured index include a `tenant_id` field — the backend filters by tenant before returning results.

### Troubleshooting common problems

- Port 3000 already in use when running the frontend.
  - See the commands above to find and kill the PID, or set `PORT` to another value when starting.

- Elasticsearch returns zero or incomplete results:
  - Verify the configured ES host/credentials in the tenant's ESIntegrationConfig (`/api/v1/es/config/es/`).
  - Confirm the index exists and documents have a `tenant_id` field.
  - Check backend logs for ES client errors — the backend will fall back to mock data when ES is unreachable.

- UI blanking after refresh:
  - The app caches the last dashboard payload in `siem_dashboard_cache_v1`. If you still see blanking, make sure the browser can read localStorage and that `frontend/src/components/Dashboard.tsx` is present and up to date.

### PRs, branches, and code review

- Base your feature branches on `main` (or `develop` if your team uses a long-lived development branch):

  ```bash
  git checkout -b feature/your-feature-name main
  ```

- Write clear commit messages and keep PRs focused. Include screenshots for UI changes and sample requests/responses for API changes.

- Small PR checklist:
  - Passes backend unit tests (`python manage.py test`)
  - Passes frontend tests (`npm test`)
  - Typescript type checks / no type regressions
  - Linting completed and no new lint errors

---

### Django Settings Overview for Beginners

If you are new to Django and Python, here is a simplified explanation of the `settings.py` file and how it works in this project.

#### What is `settings.py`?
- `settings.py` is a configuration file for the Django backend. It tells Django how to behave, which apps to use, and how to connect to databases and other services.
- Think of it as a "control panel" for the backend.

#### Key Sections in `settings.py`

1. **Base Directory (`BASE_DIR`)**:
   - This defines the root folder of the project. It is used to build paths for other files (e.g., the database file).
   - Example:
     ```python
     BASE_DIR = Path(__file__).resolve().parent.parent
     ```

2. **Installed Apps (`INSTALLED_APPS`)**:
   - This is a list of all the apps (or modules) that Django should use.
   - In this project, the apps include:
     - `users`: Handles user authentication and management.
     - `es_integration`: Manages Elasticsearch interactions.
     - `ticketing`: Manages ticket creation and updates.
   - Example:
     ```python
     INSTALLED_APPS = [
         'django.contrib.admin',
         'django.contrib.auth',
         'rest_framework',
         'users',
         'es_integration',
         'ticketing',
     ]
     ```

3. **Middleware (`MIDDLEWARE`)**:
   - Middleware is like a security checkpoint. It processes requests and responses before they reach your app.
   - Example:
     ```python
     MIDDLEWARE = [
         'django.middleware.security.SecurityMiddleware',
         'django.middleware.common.CommonMiddleware',
     ]
     ```

4. **Database Configuration (`DATABASES`)**:
   - This tells Django where to store data. In this project, we use SQLite for development.
   - Example:
     ```python
     DATABASES = {
         'default': {
             'ENGINE': 'django.db.backends.sqlite3',
             'NAME': BASE_DIR / 'db.sqlite3',
         }
     }
     ```

5. **Static Files (`STATIC_URL`)**:
   - This is where Django looks for static files like CSS and JavaScript.
   - Example:
     ```python
     STATIC_URL = 'static/'
     ```

6. **Logging Configuration (`LOGGING`)**:
   - This defines how logs are displayed. Logs help you debug issues.
   - Example:
     ```python
     LOGGING = {
         'version': 1,
         'handlers': {
             'console': {
                 'class': 'logging.StreamHandler',
             }
         },
         'loggers': {
             'users': {
                 'handlers': ['console'],
                 'level': 'INFO',
             },
         }
     }
     ```

#### How to Modify `settings.py`
1. Open the file located at `backend/siem_project/settings.py`.
2. Make changes based on your requirements (e.g., adding a new app to `INSTALLED_APPS`).
3. Save the file and restart the Django server:
   ```bash
   python manage.py runserver
   ```

#### Common Tasks
- **Add a New App**:
  - Create the app:
    ```bash
    python manage.py startapp new_app
    ```
  - Add it to `INSTALLED_APPS`:
    ```python
    INSTALLED_APPS.append('new_app')
    ```

- **Change the Database**:
  - Update the `DATABASES` section to use PostgreSQL, MySQL, etc.

By understanding `settings.py`, you can control how the backend behaves and interacts with other components.

### ES Integration and Webhook Configuration (new)

We added tenant-scoped configuration so you can connect a tenant to an Elasticsearch cluster and configure a webhook for alert notifications.

API endpoints (authenticated):
- GET/POST `/api/v1/es/config/es/` - get or update the tenant's ES config. POST body fields:
  - `enabled` (bool)
  - `hosts` (string, comma-separated)
  - `index` (string)
  - `username` (string, optional)
  - `password` (string, optional)
  - `use_ssl` (bool)
  - `verify_certs` (bool)

- GET/POST `/api/v1/es/config/webhook/` - get or update webhook config. POST body fields:
  - `url` (string)
  - `method` (string, default `POST`)
  - `headers` (object)
  - `active` (bool)

Behavior:
- The dashboard endpoint `/api/v1/es/dashboard/` will attempt to query Elasticsearch when `ESIntegrationConfig.enabled` is true for the tenant. If ES is unavailable or not configured, it falls back to the existing mock data dashboard. This allows you to keep the mock dashboard while testing a separate ES-backed dashboard.

New test dashboard:
- A new dashboard component (`Dashboard.tsx`) can be used to switch between `mock` and `es` mode for testing.
- To test ES integration:
  1. Configure ES via the API (`/api/v1/es/config/es/`) for your tenant.
  2. Ensure the ES cluster is reachable from the backend and contains documents in the configured index with a `tenant_id` field.
  3. Load the frontend dashboard and switch to `es` mode to verify data is read from Elasticsearch.

Notes:
- The ES integration uses the `elasticsearch` Python client if available. Install it in your backend virtualenv:
  ```bash
  pip install elasticsearch
  ```
- Webhook sending is not automatically triggered by these endpoints; they only store the configuration. A separate process (e.g., signal or celery task) can read `WebhookConfig` and post notifications when alerts are created.