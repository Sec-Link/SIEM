# Contribution Guidelines

This project is a multi-tenant SIEM platform with both backend and frontend collaboration. The following guidelines help team members understand their responsibilities and the development process.

## Project Structure
```
SIEM/
├── backend/   # Django backend
│   ├── users/         # User management module
│   ├── alerts/        # Alert management module
│   ├── tickets/       # Ticket management module
│   └── settings.py    # Global settings
├── frontend/  # React frontend
│   ├── src/
│   │   ├── components/  # Components
│   │   ├── pages/        # Pages
│   │   └── api.ts        # Frontend API
├── README.md  # Project documentation
└── CONTRIBUTING.md  # Contribution guidelines
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