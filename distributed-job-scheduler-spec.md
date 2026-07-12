# Distributed Job Scheduler — Complete Technical Specification

> **Document Type:** Production-Grade Build Specification  
> **Target:** End-to-End Implementation (Backend + Frontend + Infrastructure)  
> **Standard:** Top 1% Engineering Quality — Modular, Observable, Scalable, Testable  
> **Audience:** AI Build Agent (Kiro) / Senior Engineering Team  

---

## 1. Executive Summary & Vision

Build a **production-inspired distributed job scheduling platform** that reliably executes asynchronous background jobs across multiple workers. The system must demonstrate deep understanding of:

- **Relational database design** (normalization, indexing, concurrency control)
- **Distributed systems** (atomic job claiming, idempotency, graceful degradation)
- **Backend engineering** (REST API design, validation, structured errors, auth)
- **Frontend UX** (real-time dashboard, data visualization, intuitive job management)
- **Observability** (metrics, logs, health checks, execution tracing)

**Core Philosophy:** *Engineering quality over feature count.* Every feature implemented must be robust, well-tested, and observable.

---

## 2. Tech Stack (Production-Grade)

| Layer | Technology | Justification |
|-------|-----------|---------------|
| **Backend API** | Node.js + Express / Fastify OR Go + Gin / Python + FastAPI | Type-safe, high-performance, excellent middleware ecosystem. **Recommended: Node.js + Express with TypeScript** for rapid development and rich package ecosystem. |
| **Worker Service** | Same runtime as API (shared types/DB models) but separate deployable unit | Workers must be horizontally scalable independently from API. |
| **Database** | PostgreSQL 15+ | ACID compliance, robust concurrency primitives (SKIP LOCKED, Advisory Locks), excellent JSON support for metadata. |
| **Cache & Locks** | Redis 7+ | Distributed locking (Redlock), rate limiting, pub/sub for real-time updates, worker heartbeat storage. |
| **Frontend** | React 18 + TypeScript + Vite | Modern component model, excellent dev experience, strong typing. |
| **UI Framework** | Tailwind CSS + shadcn/ui + Radix UI | Rapid, accessible, customizable component system. |
| **Charts** | Recharts + Tremor | React-native charting, dashboard-focused components. |
| **State Management** | Zustand (client) + React Query (server state) | Lightweight, excellent caching, background refetching. |
| **Real-time** | Socket.io (WebSocket fallback to polling) | Reliable bidirectional communication, room-based broadcasting. |
| **Message Queue** | PostgreSQL (SKIP LOCKED) + Redis (optional for high-throughput) | Keep it simple initially; PostgreSQL is sufficient for the assignment scope. |
| **Auth** | JWT (access + refresh tokens) + bcrypt | Stateless, scalable, well-understood. |
| **Validation** | Zod (shared between frontend and backend) | Single source of truth for schemas. |
| **Testing** | Vitest (unit) + Playwright (E2E) + Supertest (API) | Fast, modern, comprehensive. |
| **Containerization** | Docker + Docker Compose | Local dev parity, easy deployment. |
| **Documentation** | Swagger/OpenAPI 3.0 auto-generated from Zod schemas | Living API documentation. |

---

## 3. System Architecture

### 3.1 High-Level Diagram (Text Description)

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Client (React SPA)                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │  Dashboard   │  │ Job Explorer │  │   Queue Management       │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ HTTPS / WSS (Socket.io)
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         API Gateway (Express)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │   Auth       │  │   REST API   │  │   WebSocket Handler      │  │
│  │  (JWT/RBAC)  │  │  (CRUD/Jobs) │  │   (Real-time Events)     │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘  │
└──────────┬───────────────┬──────────────────────┬───────────────────┘
           │               │                      │
           ▼               ▼                      ▼
┌─────────────────┐ ┌──────────────┐      ┌─────────────────────────┐
│   PostgreSQL    │ │    Redis     │      │    Worker Pool (xN)      │
│  (Primary DB)   │ │  (Cache/Lock)│      │  ┌─────┐ ┌─────┐ ┌────┐ │
│                 │ │              │      │  │ W-1 │ │ W-2 │ │ W-3│ │
│  Users          │ │  Job Locks   │      │  └─────┘ └─────┘ └────┘ │
│  Projects       │ │  Heartbeats  │      │  Polling + Executing     │
│  Queues         │ │  Rate Limits │      │  Heartbeat + DLQ         │
│  Jobs           │ └──────────────┘      └─────────────────────────┘
│  Executions     │
│  DLQ            │
└─────────────────┘
```

### 3.2 Component Breakdown

#### 3.2.1 API Gateway (REST + WebSocket)
- **Responsibilities:** Authentication, authorization, request validation, rate limiting, request routing, WebSocket connection management.
- **Scaling:** Stateless — can be scaled horizontally behind a load balancer.
- **Key Middleware:**
  - `authMiddleware`: JWT verification, RBAC enforcement.
  - `rateLimitMiddleware`: Redis-backed sliding window per API key/user.
  - `validationMiddleware`: Zod schema validation for all inputs.
  - `errorMiddleware`: Centralized error handling → structured JSON responses.
  - `loggingMiddleware`: Request/response logging with correlation IDs.

#### 3.2.2 Worker Service
- **Responsibilities:** Poll queues, atomically claim jobs, execute job handlers, send heartbeats, handle retries, move to DLQ.
- **Scaling:** Horizontally scalable — each worker is independent.
- **Concurrency Model:** Worker-wide concurrency limit + per-queue concurrency limit. Use a worker-internal job pool (Promise pool) to manage concurrent execution.
- **Graceful Shutdown:** On SIGTERM/SIGINT: stop polling, wait for active jobs to complete (with timeout), release claimed jobs back to queue.

#### 3.2.3 Database (PostgreSQL)
- **Responsibilities:** Persistent storage for all entities, atomic job claiming via `SELECT ... FOR UPDATE SKIP LOCKED`, transaction coordination.
- **Performance:** Heavily indexed. Partitioning considered for `job_executions` and `job_logs` if volume is high.

#### 3.2.4 Redis
- **Responsibilities:**
  - Distributed locks (Redlock algorithm) for critical sections.
  - Worker heartbeat storage (TTL keys).
  - Rate limiting counters.
  - Pub/sub for real-time dashboard updates (optional, can also use Socket.io rooms).

---

## 4. Database Design (PostgreSQL)

### 4.1 Schema Overview

**Normalization:** 3NF with strategic denormalization for read-heavy metrics (materialized views or cached counters).

**Concurrency Primitives:**
- Use `SELECT ... FOR UPDATE SKIP LOCKED` for atomic job claiming.
- Use PostgreSQL Advisory Locks for queue-level operations (pause/resume, configuration updates).
- Use `SERIALIZABLE` isolation only where strictly necessary; default to `READ COMMITTED`.

### 4.2 Entity Definitions

#### 4.2.1 `users`
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL, -- bcrypt
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'member' CHECK (role IN ('super_admin', 'admin', 'member', 'viewer')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role) WHERE is_active = true;
```

#### 4.2.2 `organizations`
```sql
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL, -- URL-friendly
    plan VARCHAR(50) NOT NULL DEFAULT 'free',
    settings JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### 4.2.3 `organization_members` (Many-to-Many with Roles)
```sql
CREATE TABLE organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, user_id)
);

CREATE INDEX idx_org_members_org ON organization_members(organization_id);
CREATE INDEX idx_org_members_user ON organization_members(user_id);
```

#### 4.2.4 `projects`
```sql
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, slug)
);

CREATE INDEX idx_projects_org ON projects(organization_id);
```

#### 4.2.5 `queues`
```sql
CREATE TABLE queues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    description TEXT,

    -- Configuration
    priority INTEGER NOT NULL DEFAULT 5 CHECK (priority BETWEEN 1 AND 10), -- 1 = highest
    max_concurrency INTEGER NOT NULL DEFAULT 10 CHECK (max_concurrency > 0),
    global_concurrency INTEGER NOT NULL DEFAULT 100, -- across all workers

    -- Retry Policy (embedded for quick access, normalized in retry_policies table for history)
    retry_strategy VARCHAR(50) NOT NULL DEFAULT 'exponential_backoff' 
        CHECK (retry_strategy IN ('fixed_delay', 'linear_backoff', 'exponential_backoff', 'none')),
    max_retries INTEGER NOT NULL DEFAULT 3 CHECK (max_retries >= 0),
    base_delay_ms INTEGER NOT NULL DEFAULT 1000,
    max_delay_ms INTEGER NOT NULL DEFAULT 3600000, -- 1 hour

    -- State
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),

    -- Rate Limiting
    rate_limit_per_second INTEGER,
    rate_limit_burst INTEGER,

    -- Metadata
    tags VARCHAR(50)[],
    metadata JSONB NOT NULL DEFAULT '{}',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(project_id, slug)
);

CREATE INDEX idx_queues_project ON queues(project_id);
CREATE INDEX idx_queues_status ON queues(status) WHERE status = 'active';
CREATE INDEX idx_queues_priority ON queues(priority DESC);
```

#### 4.2.6 `jobs` (The Core Entity)
```sql
CREATE TYPE job_type AS ENUM ('immediate', 'delayed', 'scheduled', 'recurring', 'batch');
CREATE TYPE job_status AS ENUM ('queued', 'scheduled', 'claimed', 'running', 'completed', 'failed', 'cancelled', 'dead');

CREATE TABLE jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    queue_id UUID NOT NULL REFERENCES queues(id) ON DELETE CASCADE,

    -- Identification
    name VARCHAR(255) NOT NULL,
    type job_type NOT NULL DEFAULT 'immediate',

    -- Payload & Handler
    handler VARCHAR(255) NOT NULL, -- identifier for the worker to know what function to run
    payload JSONB NOT NULL DEFAULT '{}',

    -- Scheduling
    scheduled_at TIMESTAMPTZ, -- for delayed/scheduled jobs
    cron_expression VARCHAR(100), -- for recurring jobs
    timezone VARCHAR(50) DEFAULT 'UTC',
    next_run_at TIMESTAMPTZ, -- for recurring jobs

    -- State Machine
    status job_status NOT NULL DEFAULT 'queued',

    -- Retry Tracking
    attempt_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    last_attempted_at TIMESTAMPTZ,

    -- Worker Assignment
    claimed_by_worker_id UUID, -- references workers(id), nullable
    claimed_at TIMESTAMPTZ,

    -- Batch Jobs
    batch_id UUID, -- groups batch jobs together
    batch_index INTEGER, -- position in batch

    -- Priority (can override queue default)
    priority INTEGER CHECK (priority BETWEEN 1 AND 10),

    -- Idempotency
    idempotency_key VARCHAR(255), -- unique per queue + key

    -- Timing
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,

    -- Constraints
    UNIQUE(queue_id, idempotency_key) WHERE idempotency_key IS NOT NULL
);

-- Critical Indexes for Performance
CREATE INDEX idx_jobs_queue_status ON jobs(queue_id, status, priority DESC, created_at ASC) 
    WHERE status IN ('queued', 'scheduled');
CREATE INDEX idx_jobs_claimed ON jobs(claimed_by_worker_id, status) WHERE status = 'claimed';
CREATE INDEX idx_jobs_scheduled_at ON jobs(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX idx_jobs_batch ON jobs(batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX idx_jobs_idempotency ON jobs(queue_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX idx_jobs_next_run ON jobs(next_run_at) WHERE type = 'recurring' AND status = 'active';
```

#### 4.2.7 `job_executions` (Audit Trail)
```sql
CREATE TABLE job_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    worker_id UUID REFERENCES workers(id) ON DELETE SET NULL,

    attempt_number INTEGER NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('started', 'success', 'failed', 'timeout', 'cancelled')),

    -- Timing
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER, -- computed

    -- Output
    stdout TEXT,
    stderr TEXT,
    exit_code INTEGER,
    output JSONB, -- structured result
    error_message TEXT,
    error_stack TEXT,

    -- Retry Decision
    will_retry BOOLEAN,
    next_retry_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_executions_job ON job_executions(job_id, attempt_number DESC);
CREATE INDEX idx_executions_worker ON job_executions(worker_id, started_at DESC);
CREATE INDEX idx_executions_status ON job_executions(status, created_at DESC);
```

#### 4.2.8 `workers`
```sql
CREATE TABLE workers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    hostname VARCHAR(255) NOT NULL,
    pid INTEGER NOT NULL,

    -- Capabilities
    queues UUID[] NOT NULL, -- array of queue IDs this worker can process
    max_concurrency INTEGER NOT NULL DEFAULT 5,
    current_load INTEGER NOT NULL DEFAULT 0,

    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'active', 'draining', 'offline')),

    -- Metadata
    version VARCHAR(50),
    metadata JSONB NOT NULL DEFAULT '{}',

    -- Lifecycle
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    stopped_at TIMESTAMPTZ
);

CREATE INDEX idx_workers_status ON workers(status, last_heartbeat_at DESC);
CREATE INDEX idx_workers_queues ON workers USING GIN(queues);
```

#### 4.2.9 `worker_heartbeats`
```sql
CREATE TABLE worker_heartbeats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,

    -- Metrics
    cpu_percent DECIMAL(5,2),
    memory_mb INTEGER,
    active_jobs INTEGER NOT NULL DEFAULT 0,
    queue_depths JSONB, -- { queue_id: count }

    -- Metadata
    metadata JSONB NOT NULL DEFAULT '{}',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_heartbeats_worker ON worker_heartbeats(worker_id, created_at DESC);
```

#### 4.2.10 `dead_letter_queue` (DLQ)
```sql
CREATE TABLE dead_letter_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
    queue_id UUID NOT NULL REFERENCES queues(id) ON DELETE CASCADE,

    -- Failure Context
    final_status VARCHAR(50) NOT NULL,
    total_attempts INTEGER NOT NULL,
    last_error_message TEXT,
    last_error_stack TEXT,

    -- Original Job Snapshot (denormalized for immutability)
    job_snapshot JSONB NOT NULL,

    -- Resolution
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    resolution_action VARCHAR(50) CHECK (resolution_action IN ('retried', 'discarded', 'manual')),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dlq_queue ON dead_letter_queue(queue_id, created_at DESC);
CREATE INDEX idx_dlq_resolved ON dead_letter_queue(resolved_at) WHERE resolved_at IS NULL;
```

#### 4.2.11 `job_logs` (Structured Logging)
```sql
CREATE TABLE job_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    execution_id UUID REFERENCES job_executions(id) ON DELETE CASCADE,

    level VARCHAR(20) NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error')),
    message TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_logs_job ON job_logs(job_id, created_at DESC);
CREATE INDEX idx_logs_level ON job_logs(level, created_at DESC) WHERE level = 'error';
```

#### 4.2.12 `retry_policies` (History/Config)
```sql
CREATE TABLE retry_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    queue_id UUID NOT NULL REFERENCES queues(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    strategy VARCHAR(50) NOT NULL,
    max_retries INTEGER NOT NULL,
    base_delay_ms INTEGER NOT NULL,
    max_delay_ms INTEGER NOT NULL,
    multiplier DECIMAL(5,2), -- for exponential
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### 4.2.13 `rate_limit_buckets` (Token Bucket Implementation)
```sql
CREATE TABLE rate_limit_buckets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    queue_id UUID NOT NULL REFERENCES queues(id) ON DELETE CASCADE,
    key VARCHAR(255) NOT NULL, -- identifier for the bucket (e.g., "queue:{id}:global")
    tokens INTEGER NOT NULL,
    last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(queue_id, key)
);
```

### 4.3 Cascading Behavior Summary

| Parent | Child | On Delete | Reasoning |
|--------|-------|-----------|-----------|
| `organizations` | `projects` | CASCADE | Project cannot exist without org |
| `projects` | `queues` | CASCADE | Queue cannot exist without project |
| `queues` | `jobs` | CASCADE | Job cannot exist without queue |
| `jobs` | `job_executions` | CASCADE | Executions are part of job history |
| `jobs` | `job_logs` | CASCADE | Logs are part of job history |
| `jobs` | `dead_letter_queue` | CASCADE | DLQ entry tied to specific job |
| `workers` | `worker_heartbeats` | CASCADE | Heartbeats are ephemeral worker data |
| `users` | `dead_letter_queue.resolved_by` | SET NULL | Keep DLQ record even if user deleted |

### 4.4 Performance Considerations

1. **Hot Path Indexing:** The `idx_jobs_queue_status` index is the most critical — it must support the worker polling query efficiently.
2. **Partitioning:** If `job_executions` exceeds 10M rows, consider monthly partitioning by `created_at`.
3. **Archival:** Jobs in `completed` status older than 30 days should be moved to an `archived_jobs` table or cold storage.
4. **Vacuuming:** High churn on `jobs` table requires aggressive autovacuum settings.
5. **Connection Pooling:** Use PgBouncer in transaction mode for high worker concurrency.

---

## 5. Backend API Specification

### 5.1 Authentication & Authorization

**Auth Flow:**
1. `POST /auth/register` → Creates user + organization (owner role)
2. `POST /auth/login` → Returns `{ accessToken, refreshToken }`
3. `POST /auth/refresh` → Rotates refresh token, returns new access token
4. `POST /auth/logout` → Invalidates refresh token

**JWT Structure:**
```json
{
  "sub": "user-uuid",
  "org": "org-uuid",
  "role": "admin",
  "iat": 1234567890,
  "exp": 1234571490
}
```

**RBAC Middleware:**
- `requireAuth`: Verify JWT, attach user to request.
- `requireRole(roles[])`: Check `organization_members.role` against allowed roles.
- `requireOwnership`: For project/queue-level resources, verify user belongs to the parent organization.

### 5.2 Standard Response Format

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  },
  "error": null
}
```

Error Response:
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "JOB_NOT_FOUND",
    "message": "Job with id 'xyz' not found",
    "details": { "jobId": "xyz" },
    "status": 404
  }
}
```

### 5.3 API Endpoints

#### 5.3.1 Authentication
```
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout
GET    /api/v1/auth/me
```

#### 5.3.2 Organizations
```
GET    /api/v1/organizations/:id
PATCH  /api/v1/organizations/:id
GET    /api/v1/organizations/:id/members
POST   /api/v1/organizations/:id/members
DELETE /api/v1/organizations/:id/members/:userId
PATCH  /api/v1/organizations/:id/members/:userId/role
```

#### 5.3.3 Projects
```
GET    /api/v1/projects?orgId=&page=&limit=&search=
POST   /api/v1/projects
GET    /api/v1/projects/:id
PATCH  /api/v1/projects/:id
DELETE /api/v1/projects/:id
GET    /api/v1/projects/:id/stats
```

#### 5.3.4 Queues (CRUD + Management)
```
GET    /api/v1/queues?projectId=&status=&page=&limit=
POST   /api/v1/queues
GET    /api/v1/queues/:id
PATCH  /api/v1/queues/:id
DELETE /api/v1/queues/:id
POST   /api/v1/queues/:id/pause
POST   /api/v1/queues/:id/resume
GET    /api/v1/queues/:id/stats          -- throughput, depth, latency
GET    /api/v1/queues/:id/metrics        -- time-series data
PATCH  /api/v1/queues/:id/retry-policy
```

**Queue Stats Response:**
```json
{
  "queueId": "uuid",
  "depth": 150,
  "processing": 10,
  "completedLastHour": 450,
  "failedLastHour": 12,
  "averageLatencyMs": 245,
  "workersActive": 3
}
```

#### 5.3.5 Jobs (The Heart of the System)
```
GET    /api/v1/jobs?queueId=&status=&type=&priority=&from=&to=&search=&page=&limit=&sort=
POST   /api/v1/jobs
POST   /api/v1/jobs/batch
GET    /api/v1/jobs/:id
PATCH  /api/v1/jobs/:id
DELETE /api/v1/jobs/:id
POST   /api/v1/jobs/:id/cancel
POST   /api/v1/jobs/:id/retry
GET    /api/v1/jobs/:id/executions
GET    /api/v1/jobs/:id/logs
```

**Create Job Request:**
```json
{
  "queueId": "uuid",
  "name": "Send welcome email",
  "type": "immediate",
  "handler": "email.send-welcome",
  "payload": { "userId": "123", "template": "welcome_v2" },
  "priority": 2,
  "idempotencyKey": "welcome-123",
  "scheduledAt": "2026-07-15T10:00:00Z", // for delayed/scheduled
  "cronExpression": "0 9 * * *", // for recurring
  "timezone": "America/New_York"
}
```

**Create Batch Job Request:**
```json
{
  "queueId": "uuid",
  "name": "Process CSV batch",
  "handler": "csv.process-row",
  "jobs": [
    { "payload": { "row": 1 }, "priority": 5 },
    { "payload": { "row": 2 }, "priority": 5 }
  ]
}
```

#### 5.3.6 Workers
```
GET    /api/v1/workers?status=&queueId=&page=&limit=
GET    /api/v1/workers/:id
DELETE /api/v1/workers/:id
GET    /api/v1/workers/:id/heartbeats
GET    /api/v1/workers/:id/jobs
```

#### 5.3.7 Dead Letter Queue
```
GET    /api/v1/dlq?queueId=&resolved=&page=&limit=
GET    /api/v1/dlq/:id
POST   /api/v1/dlq/:id/retry
POST   /api/v1/dlq/:id/discard
```

#### 5.3.8 Dashboard / Metrics
```
GET    /api/v1/dashboard/summary          -- org-wide overview
GET    /api/v1/dashboard/queues/:id/throughput?granularity=hour&from=&to=
GET    /api/v1/dashboard/workers/health
GET    /api/v1/dashboard/jobs/timeline
```

### 5.4 Worker Internal API (Worker ↔ Database)

These are not REST endpoints but critical operations:

#### 5.4.1 Atomic Job Claim
```sql
WITH next_job AS (
    SELECT id
    FROM jobs
    WHERE queue_id = $1
      AND status IN ('queued', 'scheduled')
      AND (scheduled_at IS NULL OR scheduled_at <= NOW())
    ORDER BY priority ASC, created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
)
UPDATE jobs
SET status = 'claimed',
    claimed_by_worker_id = $2,
    claimed_at = NOW()
FROM next_job
WHERE jobs.id = next_job.id
RETURNING jobs.*;
```

#### 5.4.2 Heartbeat Update
```sql
UPDATE workers
SET last_heartbeat_at = NOW(),
    current_load = $1,
    status = 'active'
WHERE id = $2;
```

#### 5.4.3 Job Completion
```sql
UPDATE jobs
SET status = 'completed',
    completed_at = NOW(),
    attempt_count = attempt_count + 1
WHERE id = $1
  AND claimed_by_worker_id = $2; -- Ensure only the claiming worker can complete
```

#### 5.4.4 Job Failure & Retry Scheduling
```sql
-- Calculate next retry based on strategy
UPDATE jobs
SET status = CASE 
    WHEN attempt_count + 1 >= max_attempts THEN 'failed'
    ELSE 'scheduled'
END,
    scheduled_at = CASE 
    WHEN attempt_count + 1 >= max_attempts THEN NULL
    ELSE NOW() + calculate_delay(attempt_count + 1, retry_strategy)
END,
    attempt_count = attempt_count + 1,
    claimed_by_worker_id = NULL,
    claimed_at = NULL
WHERE id = $1;
```

### 5.5 Validation Rules (Zod Schemas)

All inputs must be validated with Zod. Key constraints:
- `email`: valid email format, max 255 chars
- `cronExpression`: valid cron syntax (use `cron-parser` library)
- `priority`: integer 1-10
- `scheduledAt`: must be in the future for delayed jobs
- `payload`: max 1MB JSON
- `idempotencyKey`: max 255 chars, alphanumeric + hyphens

---

## 6. Worker Service Specification

### 6.1 Worker Lifecycle

```
STARTUP
  ↓
Register worker in DB (workers table)
  ↓
Start heartbeat interval (every 5s)
  ↓
Start polling loop (per queue)
  ↓
CLAIM → EXECUTE → REPORT (loop)
  ↓
SHUTDOWN SIGNAL
  ↓
Set status = 'draining'
  ↓
Stop polling
  ↓
Wait for active jobs (timeout: 30s)
  ↓
Release uncompleted claimed jobs back to 'queued'
  ↓
Unregister worker
  ↓
EXIT
```

### 6.2 Polling Strategy

- **Interval:** Configurable per queue (default 1s, min 100ms).
- **Batch Claim:** Claim up to `N` jobs at once (where `N = min(queue.max_concurrency - current_load, worker.available_slots)`).
- **Backoff on Empty:** If no jobs available, increase polling interval exponentially up to max 30s.
- **Queue Priority:** Workers process queues in priority order (queue.priority ASC).

### 6.3 Concurrency Management

- **Worker-level:** `PromisePool` or `p-limit` library. Max concurrent jobs = `worker.max_concurrency`.
- **Queue-level:** Enforced via DB claim limit + Redis counter.
- **Global-level:** Redis distributed counter per queue.

### 6.4 Heartbeat Protocol

- **Frequency:** Every 5 seconds.
- **Storage:** Redis (primary, TTL 30s) + PostgreSQL (secondary, for persistence).
- **Failure Detection:** If worker heartbeat missing for > 30s:
  1. Mark worker as `offline`.
  2. Reclaim all its `claimed` jobs back to `queued` status.
  3. Alert via dashboard.

### 6.5 Job Execution Flow

1. **Pre-execution:**
   - Validate job payload schema.
   - Check idempotency (if key exists and job completed, return cached result).
   - Acquire distributed lock on `job:{id}` (Redis) to prevent duplicate execution in split-brain scenarios.

2. **Execution:**
   - Update job status to `running`.
   - Create `job_executions` record with `status = 'started'`.
   - Run handler function (async, with timeout).
   - Stream logs to `job_logs` table in real-time (or batch insert every 1s).

3. **Post-execution:**
   - On success: Update job to `completed`, execution to `success`, compute duration.
   - On failure: Update execution to `failed`, capture error. If retries remain, schedule next attempt. If no retries, move to DLQ.
   - Release distributed lock.

4. **Timeout Handling:**
   - Each job has a configurable timeout (default 5 min).
   - Use `AbortController` or similar to cancel execution.
   - On timeout: Mark execution as `timeout`, treat as failure.

### 6.6 Retry Strategy Implementation

| Strategy | Formula | Example (base=1s, max=1h) |
|----------|---------|---------------------------|
| **Fixed Delay** | `delay = base` | Every retry: 1s, 1s, 1s |
| **Linear Backoff** | `delay = base * attempt` | 1s, 2s, 3s |
| **Exponential Backoff** | `delay = min(base * 2^(attempt-1), max)` | 1s, 2s, 4s, 8s... |
| **Exponential + Jitter** | `delay = delay + random(0, delay/2)` | Prevents thundering herd |

**Implementation:** Add jitter (±25%) to all retry delays to prevent synchronized retries.

### 6.7 Dead Letter Queue (DLQ) Logic

A job enters DLQ when:
- `attempt_count >= max_attempts` AND last execution failed.
- Job is explicitly cancelled after being claimed (rare).
- Job timeout occurs and no retries remain.

**DLQ Entry:** Immutable snapshot of job state at failure time.
**Resolution Actions:**
- **Retry:** Clone job with `attempt_count = 0`, insert as new job, mark DLQ as resolved.
- **Discard:** Mark DLQ as resolved, delete original job (or archive).
- **Manual:** Admin inspects and decides via dashboard.

---

## 7. Frontend Dashboard Specification

### 7.1 Design System

- **Framework:** Tailwind CSS + shadcn/ui
- **Color Palette:**
  - Primary: `#0F172A` (slate-900)
  - Success: `#10B981` (emerald-500)
  - Warning: `#F59E0B` (amber-500)
  - Error: `#EF4444` (red-500)
  - Info: `#3B82F6` (blue-500)
- **Typography:** Inter (sans-serif), JetBrains Mono (monospace for logs/IDs)
- **Spacing:** 4px base unit, generous whitespace, card-based layout.
- **Dark Mode:** Default. Toggle available.

### 7.2 Page Structure & Routes

```
/                    → Dashboard (Org Overview)
/projects            → Project List
/projects/:id        → Project Detail (Queues tab)
/queues/:id          → Queue Detail (Jobs, Stats, Settings)
/jobs                → Global Job Explorer
/jobs/:id            → Job Detail (Timeline, Logs, Executions)
/workers             → Worker Fleet Status
/workers/:id         → Worker Detail (Heartbeats, Active Jobs)
/dlq                 → Dead Letter Queue
/settings            → Organization Settings
/profile             → User Profile
```

### 7.3 Dashboard (/)

**Layout:** Sidebar + Top Bar + Main Content Grid.

**Widgets (Top Row):**
1. **System Health Card:** Total jobs (last 24h), success rate %, avg latency, active workers.
2. **Queue Status Grid:** Cards for each queue showing depth, processing rate, status indicator (green/yellow/red).
3. **Worker Status:** Pie chart showing idle/active/draining/offline workers.

**Charts (Middle Row):**
1. **Throughput Chart:** Line chart, jobs processed per minute over last 6 hours. Filterable by queue.
2. **Latency Distribution:** Histogram of job execution durations.
3. **Error Rate Trend:** Bar chart of failures over time.

**Tables (Bottom Row):**
1. **Recent Jobs:** Last 50 jobs with status badges, click to detail.
2. **Active Workers:** Table with load, heartbeat age, queue assignments.

**Real-time:** All numbers update via WebSocket every 5s. Use optimistic UI for actions (pause/resume queue).

### 7.4 Job Explorer (/jobs)

**Features:**
- **Advanced Filtering:** By status (multi-select), queue, type, date range, priority, text search (name/payload).
- **Pagination:** Cursor-based for performance (not offset).
- **Bulk Actions:** Select multiple jobs → Cancel / Retry / Delete.
- **Columns:** ID (truncated), Name, Queue, Status (color-coded badge), Priority, Attempts, Created At, Duration.
- **Status Badges:**
  - Queued: gray
  - Scheduled: blue
  - Claimed: purple
  - Running: animated blue pulse
  - Completed: green
  - Failed: red
  - Dead: dark red
  - Cancelled: gray strikethrough

**Job Detail Drawer (Side Panel):**
- **Overview:** Job metadata, payload (syntax-highlighted JSON), handler.
- **Timeline:** Visual stepper showing state transitions with timestamps.
- **Executions:** Table of all attempts with duration, exit code, error message.
- **Logs:** Searchable, filterable by level, auto-scroll to bottom, exportable.
- **Actions:** Cancel (if queued/scheduled), Retry (if failed), Clone.

### 7.5 Queue Management (/queues/:id)

**Tabs:**
1. **Overview:** Real-time metrics, throughput chart, worker assignment.
2. **Jobs:** Embedded job explorer filtered to this queue.
3. **Configuration:** Form to edit priority, concurrency, retry policy, rate limits, pause/resume toggle.
4. **Settings:** Danger zone (delete queue, purge jobs).

**Pause/Resume:** Big toggle button with confirmation modal. When paused, workers stop polling but active jobs complete.

### 7.6 Worker Fleet (/workers)

**Visual:** Grid of worker cards showing:
- Name + Status dot (green = active, yellow = draining, gray = offline)
- Hostname:PID
- Load bar (current/max concurrency)
- Assigned queues (tag pills)
- Heartbeat age ("2s ago" with color shift to red if > 10s)
- Uptime

**Click-through:** Worker detail page showing heartbeat history chart, active jobs table, metadata.

### 7.7 DLQ Interface (/dlq)

**Features:**
- Filter by queue, error type, date.
- **Inspect:** Side panel showing full error stack, payload snapshot, execution history.
- **Actions:** Retry (with confirmation), Discard, Bulk Retry.
- **AI Summary (Bonus):** If implemented, show a generated summary of why the job failed (e.g., "Network timeout to external API after 3 retries").

### 7.8 Real-time Implementation

**WebSocket Events (Server → Client):**
```json
// job.status_changed
{ "event": "job.status_changed", "data": { "jobId": "uuid", "status": "running", "queueId": "uuid" } }

// worker.heartbeat
{ "event": "worker.heartbeat", "data": { "workerId": "uuid", "load": 3, "status": "active" } }

// queue.metrics_update
{ "event": "queue.metrics_update", "data": { "queueId": "uuid", "depth": 45, "throughput": 12 } }

// system.alert
{ "event": "system.alert", "data": { "level": "warning", "message": "Worker 'worker-1' missed 3 heartbeats" } }
```

**Client Handling:**
- On connect: Join rooms for current org (`org:{id}`) and visible queues (`queue:{id}`).
- On event: Update React Query cache directly (optimistic update), trigger toast notifications for alerts.
- On disconnect: Show "Reconnecting..." banner with exponential backoff retry.

---

## 8. Job Lifecycle State Machine

```
                    ┌─────────────┐
                    │   CREATED   │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌────────┐  ┌──────────┐  ┌──────────┐
        │QUEUED  │  │SCHEDULED │  │RECURRING │
        └───┬────┘  └────┬─────┘  └────┬─────┘
            │            │             │
            │ (poll)     │ (time met)  │ (cron trigger)
            ▼            ▼             ▼
        ┌────────┐  ┌──────────┐  ┌──────────┐
        │CLAIMED │  │ CLAIMED  │  │ CLAIMED  │
        └───┬────┘  └────┬─────┘  └────┬─────┘
            │            │             │
            ▼            ▼             ▼
        ┌────────┐  ┌──────────┐  ┌──────────┐
        │RUNNING │  │ RUNNING  │  │ RUNNING  │
        └───┬────┘  └────┬─────┘  └────┬─────┘
            │            │             │
     ┌──────┴──────┐    │             │
     ▼             ▼    ▼             ▼
┌────────┐   ┌────────┐         ┌──────────┐
│SUCCESS │   │ FAILED │         │ TIMEOUT  │
└───┬────┘   └───┬────┘         └────┬─────┘
    │            │                   │
    │            │ (retries remain)  │ (retries remain)
    │            ▼                   ▼
    │       ┌──────────┐        ┌──────────┐
    │       │SCHEDULED │        │SCHEDULED │
    │       └──────────┘        └──────────┘
    │            │                   │
    │            │ (no retries)      │ (no retries)
    │            ▼                   ▼
    │       ┌──────────┐        ┌──────────┐
    │       │   DLQ    │        │   DLQ    │
    │       └──────────┘        └──────────┘
    │
    ▼
┌────────┐
│COMPLETED│
└────────┘

CANCELLED: Can transition from QUEUED or SCHEDULED only.
```

**State Transition Rules:**
- Only the claiming worker can move CLAIMED → RUNNING → {COMPLETED, FAILED, TIMEOUT}.
- Status updates must be idempotent (same transition twice = no-op).
- All transitions logged in `job_executions` or `job_logs`.

---

## 9. Reliability & Concurrency Patterns

### 9.1 Atomic Job Claiming (The Critical Section)

**Problem:** Multiple workers polling the same queue must not claim the same job.
**Solution:** `SELECT ... FOR UPDATE SKIP LOCKED` in a single transaction.

**Edge Case Handling:**
- **Worker crash after claim:** Heartbeat monitor detects timeout, reclaims jobs.
- **Split-brain (DB lag):** Redis distributed lock on `job_lock:{jobId}` held during entire execution.
- **Duplicate completion:** Worker sends completion twice → idempotent update (only update if status = 'running').

### 9.2 Idempotency

**Key Generation:** `sha256(queueId + idempotencyKey)`.
**Storage:** Check `jobs` table for existing completed job with same key before creating new job.
**TTL:** Idempotency keys expire after 24 hours for completed jobs (configurable).

### 9.3 Distributed Locking (Redis Redlock)

**Use Cases:**
1. Job execution (prevent duplicate execution across workers).
2. Queue configuration updates (prevent concurrent pause/resume).
3. Rate limit bucket updates (prevent over-allocation).

**Implementation:**
- Lock key: `lock:{resource}:{id}`
- TTL: 30 seconds (must be > max job execution time)
- Renewal: Worker extends lock every 10s while job is running (watchdog pattern).

### 9.4 Rate Limiting (Token Bucket)

**Algorithm:**
- Each queue has a token bucket in Redis: `rate_limit:{queueId}`.
- Tokens refill at `rate_limit_per_second` per second.
- Max tokens = `rate_limit_burst`.
- Worker checks bucket before claiming; if insufficient tokens, skip queue this poll cycle.

### 9.5 Graceful Shutdown

**Signal Handling:**
```javascript
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, starting graceful shutdown...');

  // 1. Stop polling
  poller.stop();

  // 2. Set draining status
  await worker.updateStatus('draining');

  // 3. Wait for active jobs (with 30s timeout)
  await Promise.race([
    jobPool.drain(),
    sleep(30000)
  ]);

  // 4. Release uncompleted jobs
  await worker.releaseClaimedJobs();

  // 5. Unregister
  await worker.unregister();

  process.exit(0);
});
```

### 9.6 Queue Sharding (Bonus)

**Concept:** For high-throughput queues, shard into multiple physical queues (`queue_1`, `queue_2`, ...) while presenting as one logical queue.
**Implementation:**
- Hash `job.id` to determine shard.
- Workers round-robin across shards.
- Dashboard aggregates metrics across shards.

---

## 10. Bonus Features Specification

### 10.1 Workflow Dependencies

**Concept:** Job B depends on Job A completing successfully.
**Schema Addition:**
```sql
CREATE TABLE job_dependencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE, -- the dependent job
    depends_on_job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'satisfied', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(job_id, depends_on_job_id)
);
```
**Behavior:**
- Job with dependencies is created in `scheduled` status.
- On parent completion, check if all dependencies satisfied → move to `queued`.
- On parent failure (and no retry), mark dependency as `failed`, fail dependent job.
- Dashboard: Visual DAG graph showing dependency chain.

### 10.2 Rate Limiting (Per-Queue + Global)

Already covered in 9.4. Add UI controls in queue settings.

### 10.3 Distributed Locking

Already covered in 9.3.

### 10.4 Event-Driven Execution

**Webhooks:** Allow queues to trigger HTTP webhooks on job completion/failure.
**Schema:**
```sql
CREATE TABLE queue_webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    queue_id UUID NOT NULL REFERENCES queues(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    events VARCHAR(50)[] NOT NULL, -- ['job.completed', 'job.failed']
    secret TEXT, -- for HMAC signature
    is_active BOOLEAN NOT NULL DEFAULT true
);
```

### 10.5 WebSocket Live Updates

Already covered in 7.8.

### 10.6 Role-Based Access Control (RBAC)

**Roles:**
- `super_admin`: Platform admin (can see all orgs).
- `owner`: Org owner (full access).
- `admin`: Can manage projects, queues, jobs. Cannot delete org.
- `member`: Can create jobs, view dashboards. Cannot modify queue config.
- `viewer`: Read-only access.

**Implementation:**
- Middleware checks `organization_members.role`.
- UI conditionally renders actions based on role.
- API returns 403 for unauthorized actions.

### 10.7 AI-Generated Failure Summaries (Bonus)

**Implementation:**
- On DLQ entry, send last 3 execution errors + payload to LLM API (OpenAI/Claude).
- Store summary in `dead_letter_queue.ai_summary`.
- Display in DLQ dashboard as collapsible insight card.
- **Prompt:** "Analyze these job execution errors and provide a concise 1-sentence summary of the root cause and suggested fix."

---

## 11. Testing Strategy

### 11.1 Unit Tests (Vitest)

**Coverage Targets:**
- **Validation:** All Zod schemas with valid/invalid inputs.
- **Retry Logic:** Test all strategies (fixed, linear, exponential) with edge cases (max delay cap).
- **State Machine:** Test all valid and invalid state transitions.
- **Utility Functions:** Date parsing, ID generation, delay calculations.

**Mocking:**
- Mock Redis (use `ioredis-mock` or in-memory Redis container).
- Mock database (use `pg-mem` or test container).

### 11.2 Integration Tests (Supertest + Test DB)

**API Tests:**
- Auth flow (register, login, refresh, logout).
- CRUD operations for all entities with validation errors.
- Job creation with idempotency (duplicate key rejection).
- Queue pause/resume and worker polling behavior.

**Worker Tests:**
- Start worker, insert job, verify claim + execution + completion.
- Simulate worker crash (stop process mid-execution), verify job reclaimed.
- Test retry exhaustion → DLQ.
- Test graceful shutdown.

**Concurrency Tests:**
- Run 5 workers simultaneously, insert 100 jobs, verify no duplicate execution.
- Use `Promise.all` with controlled random delays.

### 11.3 End-to-End Tests (Playwright)

**Scenarios:**
1. **Happy Path:** Login → Create Queue → Create Job → Verify Dashboard shows completion.
2. **Failure & Retry:** Create failing job → Verify retry attempts → Verify DLQ entry → Retry from DLQ → Verify success.
3. **Real-time:** Create job → Watch dashboard update without refresh.
4. **RBAC:** Login as viewer → Verify "Create Job" button is disabled.

### 11.4 Load Testing (k6)

**Scenarios:**
- 100 workers, 10,000 jobs/minute.
- Measure claim latency, execution throughput, DB connection pool saturation.
- Identify bottlenecks in indexing or locking.

---

## 12. Project Structure (Monorepo)

```
distributed-job-scheduler/
├── docker-compose.yml              # Postgres + Redis + App + Worker
├── Makefile                       # Common commands (dev, test, migrate)
├── README.md                      # Setup instructions, architecture overview
├── docs/
│   ├── ARCHITECTURE.md            # System architecture diagram (Mermaid)
│   ├── ER_DIAGRAM.md              # Entity relationship diagram (Mermaid)
│   ├── API.md                     # Auto-generated OpenAPI spec
│   └── DECISIONS.md               # Design decisions & trade-offs
├── packages/
│   ├── shared/                    # Shared types, Zod schemas, utilities
│   │   ├── src/
│   │   │   ├── schemas/           # Zod schemas (used by both API and frontend)
│   │   │   ├── types/             # TypeScript interfaces
│   │   │   └── constants/         # Enums, config defaults
│   │   └── package.json
│   ├── api/                       # REST API + WebSocket server
│   │   ├── src/
│   │   │   ├── config/            # DB, Redis, env vars
│   │   │   ├── middleware/        # Auth, validation, error, rate limit
│   │   │   ├── routes/            # Route handlers per domain
│   │   │   ├── services/          # Business logic (QueueService, JobService)
│   │   │   ├── repositories/      # Database access layer (Prisma/TypeORM)
│   │   │   ├── workers/           # Worker lifecycle management (if colocated)
│   │   │   ├── websocket/         # Socket.io handlers
│   │   │   ├── utils/             # Helpers, logger
│   │   │   └── app.ts             # Express app setup
│   │   ├── tests/
│   │   └── package.json
│   ├── worker/                    # Standalone worker service
│   │   ├── src/
│   │   │   ├── handlers/          # Job handler registry (email, webhook, etc.)
│   │   │   ├── poller/            # Queue polling logic
│   │   │   ├── executor/          # Job execution engine
│   │   │   ├── heartbeat/         # Heartbeat sender
│   │   │   ├── lock/              # Distributed lock manager
│   │   │   └── main.ts            # Worker entry point
│   │   ├── tests/
│   │   └── package.json
│   └── web/                       # React Dashboard
│       ├── src/
│       │   ├── components/        # Reusable UI (shadcn/ui based)
│       │   ├── pages/             # Route-level components
│       │   ├── hooks/             # Custom React hooks (useJobs, useWorkers)
│       │   ├── stores/            # Zustand state management
│       │   ├── lib/               # API client, Socket.io client, utils
│       │   ├── types/             # Frontend-specific types
│       │   └── main.tsx           # Entry point
│       ├── tests/
│       └── package.json
└── infra/
    ├── docker/
    │   ├── Dockerfile.api
    │   ├── Dockerfile.worker
    │   └── Dockerfile.web
    └── k8s/                       # Optional Kubernetes manifests
```

---

## 13. Implementation Phases (Prioritized)

### Phase 1: Foundation (Week 1)
- [ ] Project setup (monorepo, Docker, TypeScript, linting)
- [ ] Database schema design & migration (Prisma or TypeORM)
- [ ] Shared Zod schemas and TypeScript types
- [ ] Basic Express API with health check
- [ ] PostgreSQL + Redis connection

### Phase 2: Core Backend (Week 1-2)
- [ ] Authentication (register, login, JWT, RBAC middleware)
- [ ] Organization & Project CRUD
- [ ] Queue CRUD with configuration
- [ ] Job CRUD (immediate, delayed, scheduled)
- [ ] Basic worker service (polling, claiming, executing)
- [ ] Job state machine implementation
- [ ] Retry logic (fixed, linear, exponential)
- [ ] DLQ implementation

### Phase 3: Frontend Core (Week 2-3)
- [ ] React + Tailwind + shadcn/ui setup
- [ ] Auth pages (login, register)
- [ ] Dashboard layout (sidebar, routing)
- [ ] Project & Queue management pages
- [ ] Job explorer with filtering
- [ ] Job detail view (timeline, logs)
- [ ] Worker status page

### Phase 4: Real-time & Polish (Week 3)
- [ ] WebSocket integration (Socket.io)
- [ ] Real-time dashboard updates
- [ ] Queue pause/resume UI
- [ ] DLQ management interface
- [ ] Charts and metrics visualization
- [ ] Dark mode, responsive design
- [ ] Error boundaries, loading states, empty states

### Phase 5: Advanced Features (Week 4)
- [ ] Recurring jobs (cron parser + scheduler)
- [ ] Batch jobs
- [ ] Rate limiting (token bucket)
- [ ] Distributed locking (Redlock)
- [ ] Workflow dependencies
- [ ] Webhook events
- [ ] AI failure summaries (bonus)

### Phase 6: Testing & Documentation (Week 4-5)
- [ ] Unit tests (target: 80% coverage)
- [ ] Integration tests for API
- [ ] Worker concurrency tests
- [ ] E2E tests (Playwright)
- [ ] Load testing (k6)
- [ ] Architecture diagram (Mermaid)
- [ ] ER diagram (Mermaid)
- [ ] API documentation (Swagger UI)
- [ ] Design decisions document
- [ ] Setup instructions (README)

---

## 14. Design Decisions & Trade-offs

### 14.1 PostgreSQL as Message Queue
**Decision:** Use PostgreSQL `FOR UPDATE SKIP LOCKED` instead of RabbitMQ/Kafka.
**Pros:** One less infrastructure component, ACID guarantees, easy backup, works for assignment scale.
**Cons:** Not optimal for >10k jobs/sec, connection pool limits, vacuum overhead.
**Mitigation:** Connection pooling (PgBouncer), aggressive indexing, connection limits on workers.

### 14.2 Separate Worker Service
**Decision:** Worker is a separate deployable unit from API.
**Pros:** Independent scaling, failure isolation, different resource profiles (workers are CPU-heavy, API is I/O-heavy).
**Cons:** Slightly more complex deployment, shared code requires careful package management.
**Mitigation:** Shared `packages/shared` library, Docker Compose for local dev.

### 14.3 Embedded Retry Policy in Queue
**Decision:** Store active retry policy on `queues` table, with history in `retry_policies`.
**Pros:** Fast read during job failure (no join needed), simple configuration.
**Cons:** Slight denormalization, history table could drift if not maintained.
**Mitigation:** Update both atomically in a transaction.

### 14.4 WebSocket over SSE
**Decision:** Use Socket.io (WebSocket with polling fallback) instead of Server-Sent Events.
**Pros:** Bidirectional (needed for client subscribing to specific rooms), better browser support, automatic reconnection.
**Cons:** Heavier protocol, requires Socket.io client library.
**Mitigation:** Use only where needed (dashboard), REST for everything else.

### 14.5 Monorepo vs. Polyrepo
**Decision:** Monorepo with shared `packages/shared`.
**Pros:** Atomic changes across API/worker/frontend, shared types prevent drift, easier CI/CD.
**Cons:** Slightly more complex tooling (Turborepo recommended).

---

## 15. Deployment & Operations

### 15.1 Local Development
```bash
# One command to start everything
make dev
# Spins up: Postgres, Redis, API (port 3001), Worker (x2 instances), Web (port 3000)
```

### 15.2 Docker Compose (Production-Ready Local)
```yaml
services:
  postgres:
    image: postgres:15-alpine
    volumes:
      - pg_data:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: jobscheduler
      POSTGRES_USER: app
      POSTGRES_PASSWORD: ${DB_PASSWORD}

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data

  api:
    build: ./packages/api
    depends_on: [postgres, redis]
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://app:${DB_PASSWORD}@postgres:5432/jobscheduler
      - REDIS_URL=redis://redis:6379
    deploy:
      replicas: 2

  worker:
    build: ./packages/worker
    depends_on: [postgres, redis]
    deploy:
      replicas: 3

  web:
    build: ./packages/web
    ports: ["80:80"]
    depends_on: [api]
```

### 15.3 Health Checks
- **API:** `GET /health` → checks DB and Redis connectivity.
- **Worker:** Heartbeat in DB + `/health` HTTP endpoint (if exposed).
- **Database:** Connection pool monitoring, slow query logging.

### 15.4 Monitoring (Observability)
- **Metrics:** Prometheus-compatible metrics (job throughput, latency, error rate, queue depth, worker load).
- **Logging:** Structured JSON logs (Winston/Pino). Correlation ID per request.
- **Alerting:** Webhook alerts for worker offline, DLQ growth, high error rate.

### 15.5 Security Checklist
- [ ] All inputs validated (Zod).
- [ ] SQL injection prevention (parameterized queries/ORM).
- [ ] XSS prevention (React escapes by default, sanitize HTML if needed).
- [ ] CSRF protection (not needed for JWT SPA, but ensure `SameSite=Strict` cookies if using cookies).
- [ ] Rate limiting on auth endpoints (prevent brute force).
- [ ] Secrets in environment variables, never in code.
- [ ] HTTPS in production.
- [ ] CORS configured strictly.

---

## 16. API Documentation (OpenAPI 3.0)

**Requirement:** Auto-generate from Zod schemas using `zod-to-openapi` or `@asteasolutions/zod-to-openapi`.
**Endpoint:** `GET /api/v1/docs` serves Swagger UI.
**Coverage:** Every endpoint must be documented with:
- Summary and description
- Request schema (Zod)
- Response schemas (200, 400, 401, 403, 404, 500)
- Authentication requirements
- Example requests/responses

---

## 17. Evaluation Alignment Checklist

| Criteria | How This Spec Addresses It |
|----------|------------------------------|
| **System Architecture (20)** | Microservice-ready monolith, clear separation of concerns, horizontal scaling plan, detailed architecture diagram. |
| **Database Design (20)** | 3NF with strategic denormalization, 13 detailed tables with PKs/FKs/indexes, cascading rules, performance notes, concurrency primitives. |
| **Backend Engineering (20)** | Type-safe, middleware pipeline, service/repository pattern, atomic operations, idempotency, structured errors, comprehensive API spec. |
| **Reliability & Concurrency (15)** | SKIP LOCKED claiming, distributed locks, heartbeat failure detection, graceful shutdown, retry strategies with jitter, DLQ, rate limiting. |
| **Frontend & UX (10)** | Design system, real-time updates, responsive layout, dark mode, intuitive navigation, data visualization, job timeline. |
| **API Design (5)** | RESTful, versioned, paginated, filtered, consistent response format, auto-generated OpenAPI docs. |
| **Documentation (5)** | This entire document + architecture decisions + ER diagram + setup instructions. |
| **Testing (5)** | Unit, integration, concurrency, E2E, load testing with clear targets and tools. |

---

## 18. Quick Reference: Critical Implementation Details

### 18.1 Atomic Claim Query (Copy-Paste Ready)
```sql
WITH available_jobs AS (
    SELECT id
    FROM jobs
    WHERE queue_id = $1
      AND status IN ('queued', 'scheduled')
      AND (scheduled_at IS NULL OR scheduled_at <= NOW())
      AND (idempotency_key IS NULL OR NOT EXISTS (
          SELECT 1 FROM jobs j2 
          WHERE j2.queue_id = jobs.queue_id 
            AND j2.idempotency_key = jobs.idempotency_key 
            AND j2.status = 'completed'
            AND j2.completed_at > NOW() - INTERVAL '24 hours'
      ))
    ORDER BY COALESCE(priority, (SELECT priority FROM queues WHERE id = $1)) ASC, 
             created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT $2
)
UPDATE jobs
SET status = 'claimed',
    claimed_by_worker_id = $3,
    claimed_at = NOW()
FROM available_jobs
WHERE jobs.id = available_jobs.id
RETURNING jobs.*;
```

### 18.2 Retry Delay Calculation (TypeScript)
```typescript
function calculateRetryDelay(
  attempt: number,
  strategy: RetryStrategy,
  baseDelayMs: number,
  maxDelayMs: number
): number {
  let delay: number;
  switch (strategy) {
    case 'fixed_delay':
      delay = baseDelayMs;
      break;
    case 'linear_backoff':
      delay = baseDelayMs * attempt;
      break;
    case 'exponential_backoff':
      delay = baseDelayMs * Math.pow(2, attempt - 1);
      break;
    default:
      delay = baseDelayMs;
  }
  delay = Math.min(delay, maxDelayMs);
  // Add jitter (±25%)
  const jitter = delay * 0.25 * (Math.random() * 2 - 1);
  return Math.floor(delay + jitter);
}
```

### 18.3 Worker Heartbeat Monitor (Pseudo-code)
```typescript
setInterval(async () => {
  const staleWorkers = await db.query(`
    SELECT id FROM workers 
    WHERE status = 'active' 
      AND last_heartbeat_at < NOW() - INTERVAL '30 seconds'
  `);

  for (const worker of staleWorkers) {
    await db.transaction(async (trx) => {
      // Reclaim jobs
      await trx.query(`
        UPDATE jobs 
        SET status = 'queued', 
            claimed_by_worker_id = NULL, 
            claimed_at = NULL 
        WHERE claimed_by_worker_id = $1 
          AND status = 'claimed'
      `, [worker.id]);

      // Mark worker offline
      await trx.query(`
        UPDATE workers 
        SET status = 'offline' 
        WHERE id = $1
      `, [worker.id]);
    });

    logger.warn(`Worker ${worker.id} marked offline, jobs reclaimed`);
    websocket.emit('system.alert', { level: 'warning', message: `Worker offline: ${worker.id}` });
  }
}, 10000);
```

---

## 19. Final Notes for the Builder

1. **Quality over Quantity:** It is better to implement 80% of features with 100% reliability than 100% of features with bugs.
2. **Type Safety:** Use TypeScript strictly. Shared Zod schemas between frontend and backend are non-negotiable.
3. **Observability:** Every action should be loggable, every state transition trackable, every error meaningful.
4. **User Experience:** The dashboard should feel like a real product — not a demo. Loading states, error messages, empty states, and responsive design matter.
5. **Test the Hard Parts:** Focus testing on job claiming concurrency, retry logic, graceful shutdown, and auth flows.
6. **Document as You Build:** Keep `DECISIONS.md` updated with every architectural choice made during implementation.

**This specification is designed to produce a system that demonstrates senior-level engineering judgment. Build it with pride.**

---

*Document Version: 1.0*  
*Last Updated: 2026-07-12*  
*Author: Technical Specification Engine*
