# Requirements

## Functional Requirements (EARS)

### Authentication & Project Management
- **US-1:** As a user, I want to register and log in, so that my projects and jobs are private to my organization.
  - WHEN a user submits valid registration details THE SYSTEM SHALL create an account with a securely hashed password and SHALL NOT store plaintext passwords.
  - WHEN a user submits valid credentials THE SYSTEM SHALL issue a short-lived access token and a longer-lived refresh token.
  - WHEN an access token expires THE SYSTEM SHALL reject the request with 401 and a machine-readable error code.
  - WHEN a refresh token is presented and valid THE SYSTEM SHALL issue a new access token without requiring re-login.

- **US-2:** As a user, I want to create and manage projects, so that I can group related queues.
  - WHEN an authenticated user creates a project THE SYSTEM SHALL associate it with their organization and record the creator.
  - WHEN a user requests their project list THE SYSTEM SHALL return only projects belonging to their organization, paginated.

### Queue Management
- **US-3:** As a user, I want to configure queues per project, so that I can control throughput and failure behavior per workload.
  - WHEN a user creates a queue THE SYSTEM SHALL require a unique name within the project and SHALL accept priority, concurrency limit, and an optional retry policy.
  - WHEN a user pauses a queue THE SYSTEM SHALL stop workers from claiming new jobs from that queue while allowing already-claimed jobs to finish.
  - WHEN a user resumes a paused queue THE SYSTEM SHALL make eligible jobs claimable again immediately.
  - WHEN a user requests queue statistics THE SYSTEM SHALL return counts by status, current throughput, and average execution duration.

### Job Submission
- **US-4:** As a user, I want to submit jobs of different timing types through one API, so that I can cover immediate, delayed, scheduled, recurring, and batch workloads.
  - WHEN a job is submitted with no `run_at` THE SYSTEM SHALL mark it `queued` and make it immediately claimable.
  - WHEN a job is submitted with a future `run_at` THE SYSTEM SHALL mark it `scheduled` and SHALL NOT make it claimable until `run_at` has passed.
  - WHEN a recurring job definition is created with a cron expression THE SYSTEM SHALL compute the next `run_at` and materialize a concrete job row at each occurrence.
  - WHEN multiple jobs are submitted under one batch request THE SYSTEM SHALL tag them with a shared batch identifier and SHALL expose aggregate batch progress.
  - WHEN a job is submitted with an idempotency key already seen for that queue THE SYSTEM SHALL return the existing job instead of creating a duplicate.

### Worker Execution
- **US-5:** As a system, I want workers to claim jobs atomically, so that no job is executed twice.
  - WHEN two or more workers attempt to claim from the same queue concurrently THE SYSTEM SHALL guarantee each eligible job is claimed by exactly one worker.
  - WHEN a worker claims a job THE SYSTEM SHALL transition it to `claimed` and then `running`, recording the worker id and timestamps.
  - WHEN a worker is executing jobs THE SYSTEM SHALL receive periodic heartbeats and SHALL mark a worker offline if heartbeats stop for longer than a configured timeout.
  - WHEN a worker is marked offline while holding claimed or running jobs THE SYSTEM SHALL requeue those jobs without counting the requeue as a failed attempt against the job's retry budget.
  - WHEN a worker receives a shutdown signal THE SYSTEM SHALL stop claiming new jobs, allow in-flight jobs to finish within a drain timeout, and exit cleanly.
  - WHEN a queue's concurrency limit is reached THE SYSTEM SHALL NOT allow additional jobs from that queue to enter `running` state until capacity frees up.

### Retry, Failure & Dead-Letter
- **US-6:** As a user, I want configurable retry behavior, so that transient failures self-heal without manual intervention.
  - WHEN a job execution fails and attempts remain THE SYSTEM SHALL compute the next delay using the job's retry policy (fixed, linear, or exponential backoff) and SHALL return the job to `scheduled` with the new `run_at`.
  - WHEN a job exhausts its maximum attempts THE SYSTEM SHALL move it to the dead-letter queue and SHALL preserve its full failure history.
  - WHEN a user requeues a dead-lettered job from the dashboard THE SYSTEM SHALL reset its attempt count and resubmit it while preserving the original record for audit.

### Observability & Dashboard
- **US-7:** As a user, I want full visibility into jobs, workers, and system health, so that I can operate the platform without reading logs by hand.
  - WHEN a job transitions state THE SYSTEM SHALL append an execution record and structured log entries queryable by job id.
  - WHEN a user opens the job explorer THE SYSTEM SHALL support filtering by status, queue, date range, and free-text search, with pagination.
  - WHEN a user opens the worker monitor THE SYSTEM SHALL show live status, current load, and last-heartbeat age for every worker.
  - WHEN system state changes (job completes, worker goes offline, queue is paused) THE SYSTEM SHALL push updates to connected dashboard clients without requiring a manual refresh.

## Non-Functional Requirements

- WHEN the system is under concurrent load THE SYSTEM SHALL prevent duplicate job execution through database-level atomic claiming, not application-level locks alone.
- WHEN a job handler is invoked more than once for the same logical execution (crash-recovery scenario) THE SYSTEM SHALL document this as an at-least-once delivery contract and SHALL make job creation idempotent via idempotency keys.
- WHEN any API request fails validation or authorization THE SYSTEM SHALL return a structured error object with a stable error code, human-readable message, and (where applicable) field-level details.
- WHEN the system logs an event THE SYSTEM SHALL include a correlation id traceable from API request through worker execution.
- THE SYSTEM SHALL remain operable with more than one worker instance and more than one API instance running simultaneously (horizontal scalability as a first-class constraint, not an afterthought).
