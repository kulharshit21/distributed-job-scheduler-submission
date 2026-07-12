# System Structure

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

**Components:**
- **API tier** — stateless NestJS instances behind a load balancer; any instance can serve any request, so scaling out is just adding instances.
- **Worker fleet** — independent processes (can run on separate hosts), each polling assigned queues and also listening for `NOTIFY` events for low-latency wake-up. Workers never talk to each other directly; Postgres is the only coordination point for claiming.
- **Redis** — used for three narrow purposes only: (1) leader election lock so exactly one scheduler process materializes cron jobs, (2) token-bucket rate limiting, (3) pub/sub so a status change seen by API-instance-1 reaches a dashboard client connected to API-instance-2.
- **Scheduler process** — a small standalone process (or a leader-elected instance among the workers) that scans `scheduled_jobs` for due entries and materializes rows into `jobs`. Leader election prevents duplicate materialization if run with multiple replicas for HA.
- **Postgres is the single source of truth** for job state. This is deliberate: correctness of "exactly one worker executes a job" must not depend on two systems agreeing — see §10.
