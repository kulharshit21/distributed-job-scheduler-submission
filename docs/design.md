# Design Document

## System Architecture

```mermaid
flowchart TB
    subgraph Client
        UI[React Dashboard]
    end

    subgraph API_Tier["API Tier (horizontally scaled)"]
        API1[NestJS API instance 1]
        API2[NestJS API instance N]
        WS[Socket.io Gateway]
    end

    subgraph Coordination
        REDIS[(Redis: locks, rate limits, pub/sub)]
    end

    subgraph Data_Tier
        PG[(PostgreSQL: source of truth)]
    end

    subgraph Workers["Worker Fleet (horizontally scaled)"]
        W1[Worker process 1]
        W2[Worker process N]
    end

    subgraph SchedulerProc["Scheduler process (leader-elected)"]
        SCHED[Cron materializer]
    end

    UI <-->|REST + WebSocket| API1
    UI <-->|REST + WebSocket| API2
    API1 <--> PG
    API2 <--> PG
    API1 <--> REDIS
    API2 <--> REDIS
    WS <--> REDIS

    W1 -->|SKIP LOCKED claim| PG
    W2 -->|SKIP LOCKED claim| PG
    W1 -->|heartbeat| PG
    W2 -->|heartbeat| PG
    PG -->|LISTEN/NOTIFY job_created| W1
    PG -->|LISTEN/NOTIFY job_created| W2
    W1 -->|status change event| REDIS
    W2 -->|status change event| REDIS

    SCHED -->|leader lock| REDIS
    SCHED -->|materialize due jobs| PG
```

## Database Design

```mermaid
erDiagram
    ORGANIZATIONS ||--o{ USERS : has
    ORGANIZATIONS ||--o{ PROJECTS : has
    PROJECTS ||--o{ PROJECT_MEMBERS : has
    USERS ||--o{ PROJECT_MEMBERS : has
    PROJECTS ||--o{ QUEUES : has
    QUEUES ||--o| RETRY_POLICIES : default_policy
    QUEUES ||--o{ JOBS : holds
    QUEUES ||--o{ SCHEDULED_JOBS : defines
    RETRY_POLICIES ||--o{ JOBS : overrides
    JOBS ||--o{ JOB_EXECUTIONS : has
    JOBS ||--o{ JOB_LOGS : has
    JOBS ||--o| DEAD_LETTER_QUEUE : moved_to
    SCHEDULED_JOBS ||--o{ JOBS : materializes
    WORKERS ||--o{ JOB_EXECUTIONS : executes
    WORKERS ||--o{ WORKER_HEARTBEATS : sends
    BATCHES ||--o{ JOBS : groups
    JOBS ||--o{ JOB_DEPENDENCIES : depends_on

    ORGANIZATIONS {
        uuid id PK
        string name
        string slug
    }
    USERS {
        uuid id PK
        uuid org_id FK
        string email
        string password_hash
        string role
    }
    PROJECTS {
        uuid id PK
        uuid org_id FK
        string name
        string slug
        uuid created_by FK
    }
    PROJECT_MEMBERS {
        uuid project_id FK
        uuid user_id FK
        string role
    }
    QUEUES {
        uuid id PK
        uuid project_id FK
        string name
        int priority
        int concurrency_limit
        int current_running
        bool is_paused
        uuid default_retry_policy_id FK
        int rate_limit_per_second
    }
    RETRY_POLICIES {
        uuid id PK
        string name
        string strategy
        int base_delay_ms
        int max_delay_ms
        int max_attempts
        float multiplier
        bool jitter
    }
    JOBS {
        uuid id PK
        uuid queue_id FK
        uuid retry_policy_id FK
        uuid batch_id FK
        uuid parent_scheduled_job_id FK
        uuid claimed_by_worker_id FK
        string type
        jsonb payload
        string status
        int priority
        int attempt_count
        int max_attempts
        string idempotency_key
        timestamptz run_at
        timestamptz claimed_at
        timestamptz started_at
        timestamptz completed_at
    }
    JOB_EXECUTIONS {
        bigint id PK
        uuid job_id FK
        uuid worker_id FK
        int attempt_number
        string status
        timestamptz started_at
        timestamptz finished_at
        int duration_ms
        text error_message
    }
    JOB_LOGS {
        bigint id PK
        uuid job_id FK
        bigint execution_id FK
        string level
        text message
        jsonb metadata
        timestamptz created_at
    }
    WORKERS {
        uuid id PK
        string hostname
        int pid
        string status
        int concurrency_capacity
        int current_load
        timestamptz last_heartbeat_at
    }
    WORKER_HEARTBEATS {
        bigint id PK
        uuid worker_id FK
        timestamptz heartbeat_at
        int active_job_count
    }
    SCHEDULED_JOBS {
        uuid id PK
        uuid queue_id FK
        string cron_expression
        jsonb job_template
        bool is_active
        timestamptz next_run_at
        timestamptz last_run_at
        string timezone
    }
    DEAD_LETTER_QUEUE {
        uuid id PK
        uuid job_id FK
        uuid queue_id FK
        jsonb payload_snapshot
        text failure_reason
        int attempt_count
        bool resolved
        text ai_summary
    }
    BATCHES {
        uuid id PK
        string name
        int total_jobs
        int completed_jobs
        int failed_jobs
        string status
    }
    JOB_DEPENDENCIES {
        uuid job_id FK
        uuid depends_on_job_id FK
    }
```

## Job Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Queued: immediate job
    [*] --> Scheduled: delayed / cron-materialized job
    Scheduled --> Queued: run_at reached
    Queued --> Claimed: worker claims (SKIP LOCKED)
    Claimed --> Running: worker starts execution
    Running --> Completed: handler succeeds
    Running --> Scheduled: handler fails, attempts remain (backoff delay)
    Running --> DeadLetter: handler fails, attempts exhausted
    Claimed --> Queued: worker dies before starting (heartbeat timeout)
    Running --> Queued: worker dies mid-execution (heartbeat timeout)
    Queued --> Cancelled: user cancels
    Scheduled --> Cancelled: user cancels
    Completed --> [*]
    DeadLetter --> Queued: user requeues from dashboard
    Cancelled --> [*]
```

## Backend Modules Breakdown (NestJS)

```
src/
  auth/              # register, login, refresh, guards, RBAC decorators
  organizations/
  projects/
  queues/            # CRUD, pause/resume, stats
  jobs/              # submission, cancellation, job explorer queries
  retry-policies/
  scheduled-jobs/    # cron/recurring definitions + materializer task
  dead-letter/       # DLQ listing + requeue
  workers/           # worker registration, heartbeat endpoint, monitor queries
  job-logs/
  realtime/          # Socket.io gateway, Redis pub/sub bridge
  common/
    interceptors/    # logging, correlation-id
    filters/         # structured error responses
    guards/          # JWT auth guard, roles guard
    pipes/           # validation
  worker-process/    # the standalone worker entrypoint (separate deploy artifact)
    poller.ts        # claim loop + LISTEN/NOTIFY subscriber
    executor.ts      # runs job handlers, captures result/error
    heartbeat.ts
    shutdown.ts
```
