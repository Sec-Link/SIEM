# SIEM Platform

This project is a Security Information and Event Management (SIEM) platform built with a Django backend and a React frontend.

## Features
- Multi-tenancy support
- JWT-based authentication
- Modular design for users, alerts, and ticketing
- Ant Design for a modern UI

## Prerequisites
- Node.js (v16 or higher)
- Python (v3.9 or higher)
- SQLite (for development)

## Setup Instructions

### Backend
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create a virtual environment and activate it:
   ```bash
   python -m venv venv
   source venv/bin/activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Apply migrations:
   ```bash
   python manage.py migrate
   ```
5. Seed tenants (optional):
   ```bash
   python manage.py seed_tenants
   ```
6. Start the development server:
   ```bash
   python manage.py runserver
   ```

### Frontend
1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm start
   ```

## Usage
- Open your browser and navigate to `http://localhost:3000` for the frontend.
- The backend API is available at `http://localhost:8000`.

## Folder Structure
```
SIEM/
├── backend/   # Django backend
├── frontend/  # React frontend
└── README.md  # Project documentation
```

## License
This project is licensed under the MIT License.
=======
# SIEM
