# How to Use Distributed Job Scheduler

This guide will walk you through setting up, running, and using the Distributed Job Scheduler.

## 1. Prerequisites

- **Node.js** (v18 or higher)
- **Docker** and **Docker Compose**
- **npm** (v9 or higher)

## 2. Infrastructure Setup

The Scheduler relies on PostgreSQL and Redis. Start them using the provided `docker-compose.yml`:

```bash
cd d:\COODITY
docker compose up -d
```
*This starts Postgres 15 on port 5432 and Redis 7 on port 6379.*

## 3. Database Initialization

Navigate to the database package and apply the schema:

```bash
cd packages/database
npm run db:push
npm run build
cd ../..
```

## 4. Starting the Services

The application consists of three main components. You can run them concurrently using different terminal tabs, or run them from the root if you configure turbo.

### Start the API Server
```bash
cd apps/api
npm run start:dev
```
*API runs on `http://localhost:3000`.*

### Start the Worker Node
```bash
cd apps/worker
npm run start:dev
```
*The worker runs headlessly, monitoring queues and executing jobs.*

### Start the Web Dashboard
```bash
cd apps/web
npm run dev
```
*The UI runs on `http://localhost:5173`.*

## 5. Using the Application

### 5.1. Authentication
1. Open `http://localhost:5173` in your browser.
2. Click **Create Workspace** to register a new organization and user.
3. Once registered, you will be redirected to the Dashboard.

### 5.2. Dashboard & Queues
1. On the Dashboard, you'll see your Projects. (The API creates a default project automatically if needed, or you can create one via API).
2. Click **View Queues** to enter the Job Explorer for a specific project and queue.
3. In the Queue Detail view, you can:
   - Monitor real-time statistics (Queued, Running, Completed, Failed).
   - Pause or Resume the queue to halt job execution.
   - View the table of recent jobs and their current statuses.

### 5.3. Submitting Jobs (API Example)
To test job submission, you can use `curl` or Postman against the API:

```bash
# Get your JWT Token from the browser's localStorage or by logging in via API
TOKEN="your.jwt.token"
QUEUE_ID="your-queue-uuid"

# Submit an immediate job
curl -X POST http://localhost:3000/api/v1/queues/$QUEUE_ID/jobs \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "email_send",
    "payload": { "to": "user@example.com" }
  }'
```

Watch the worker terminal—it will instantly pick up the job and execute it!
