# Deep Scan Analysis: Worker & Scheduler Audit

This document details the findings of a deep scan of `apps/worker` for logic errors, job queuing/execution unhandled promise rejections, claiming bugs, and crash-loop risks, along with concrete remediation strategies.

---

## Executive Summary

The audit of `apps/worker` revealed **10 significant issues** ranging from critical process-crashing unhandled promise rejections during database or Redis blips, to concurrency race conditions causing duplicate job execution, and database state leaks that permanently degrade queue performance.

---

## Detailed Findings

### 1. Heartbeat Failures Trigger Unhandled Promise Rejections & Process Crashes
* **File:** `apps/worker/src/worker/worker.service.ts`
* **Lines:** 45–62
* **Description:** 
  The worker sends a heartbeat to the database every 10 seconds via an async callback in `setInterval`:
  ```typescript
  private startHeartbeat() {
    setInterval(async () => {
      if (!this.isRunning) return;
      await this.prisma.worker.update({ ... });
      await this.prisma.workerHeartbeat.create({ ... });
    }, 10000);
  }
  ```
  If the database connection is dropped, exhibits high latency, or restarts, the updates will fail and reject. Because the callback is an unawaited asynchronous arrow function inside `setInterval` without a `try-catch` block, the exception becomes an **unhandled promise rejection**. Under modern Node.js runtimes, this terminates the worker process, leading to a crash loop precisely during database instability.
* **Fix Strategy:** Wrap the entire async operation inside `startHeartbeat` in a `try-catch` block and log the error safely.

---

### 2. Execution Initialization Failures Trigger Unhandled Promise Rejections
* **File:** `apps/worker/src/worker/worker.service.ts`
* **Lines:** 129–143 & 174–210
* **Description:** 
  In `executeJob(job)`, the database operations to create the `JobExecution` and update the `Job` status to `running` occur *before* the `try-catch` block:
  ```typescript
  private async executeJob(job: any) {
    this.logger.log(`Executing job ${job.id}`);
    const startTime = new Date();
    
    const execution = await this.prisma.jobExecution.create({ ... }); // Can reject
    await this.prisma.job.update({ ... }); // Can reject
    
    try {
      await this.runHandler(job);
      ...
    } catch (error: any) {
      await this.handleJobFailure(job, execution.id, startTime, error); // Can also reject
    }
  }
  ```
  If `jobExecution.create` or `job.update` fails, the promise returned by `executeJob` rejects. Furthermore, if `handleJobFailure` throws an exception, `executeJob` also rejects.
  Since the caller of `executeJob` does not append a `.catch()` block (lines 118–123):
  ```typescript
  for (const job of claimedJobs) {
    this.currentLoad++;
    this.executeJob(job).finally(() => {
      this.currentLoad--;
    });
  }
  ```
  These rejections bubble up as unhandled promise rejections, crashing the worker. Furthermore, the queue's `current_running` count was already incremented during claiming, but is never decremented on failure, permanently leaking queue capacity.
* **Fix Strategy:** Wrap all operations in `executeJob` in a `try-catch` block, ensure any failures revert changes or safely update the database, and append a `.catch(...)` to the invocation of `executeJob(job)` in the polling loop.

---

### 3. Queue Polling Database Errors Crash the Worker
* **File:** `apps/worker/src/worker/worker.service.ts`
* **Lines:** 64–74
* **Description:** 
  The `poll()` function fetches all non-paused queues outside of any `try-catch` block:
  ```typescript
  private async poll() {
    if (!this.isRunning || this.currentLoad >= this.concurrencyCapacity) return;
    const queues = await this.prisma.queue.findMany({ where: { is_paused: false } }); // Can reject
    ...
  }
  ```
  If the database becomes unreachable, `findMany` throws an exception, causing the async function `poll()` to reject. Since `poll()` is invoked directly via `setInterval(() => this.poll(), 5000)` without handling its rejection, this causes an unhandled promise rejection and crashes the process.
* **Fix Strategy:** Wrap the body of `poll()` in a `try-catch` block.

---

### 4. Missing Error Event Listener on Redis Client
* **File:** `apps/worker/src/scheduler/scheduler.service.ts`
* **Lines:** 19
* **Description:** 
  The Redis connection is initialized synchronously in `onModuleInit()`:
  ```typescript
  this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  ```
  No error event listener is registered on `this.redis`. In `ioredis`, if a connection drops, the client attempts reconnection and emits an `'error'` event. If there is no registered listener for the `'error'` event, the event emitter throws an unhandled exception, crashing the Node.js process.
* **Fix Strategy:** Add a listener: `this.redis.on('error', (err) => this.logger.error('Redis connection error', err));`.

---

### 5. Claiming Bug: Stuck `'claimed'` Jobs on Worker Crash
* **Files:** 
  - `apps/worker/src/worker/worker.service.ts` (Line 93)
  - `apps/worker/src/scheduler/scheduler.service.ts` (Line 133)
* **Description:** 
  When a worker claims a job from the database, it transitions the status to `'claimed'`:
  ```typescript
  UPDATE jobs SET status = 'claimed', claimed_by_worker_id = ...
  ```
  If the worker process crashes after the transaction commits but before it starts executing the job (meaning `executeJob` is not called or fails to update the status to `'running'`), the job remains stuck with `status = 'claimed'`.
  However, the scheduler's orphan detection logic (`detectOrphans`) only searches for and requeues jobs in `'running'` status:
  ```typescript
  const jobs = await tx.job.findMany({
    where: { claimed_by_worker_id: worker.id, status: 'running' }
  });
  ```
  Thus, jobs in `'claimed'` status are completely ignored and remain stuck forever. The concurrency slot of the corresponding queue is also permanently leaked.
* **Fix Strategy:** Modify the orphan detection query to find jobs in either `'claimed'` or `'running'` status.

---

### 6. Logic Error: Materialization of Deactivated Scheduled Jobs
* **File:** `apps/worker/src/scheduler/scheduler.service.ts`
* **Lines:** 71–76
* **Description:** 
  The SQL query in `materializeJobs()` selects due jobs from the `scheduled_jobs` table:
  ```typescript
  const dueJobs = await tx.$queryRaw<any[]>`
    SELECT * FROM scheduled_jobs 
    WHERE next_run_at <= ${now} 
    FOR UPDATE SKIP LOCKED;
  `;
  ```
  This query ignores the `is_active` field. Deactivated scheduled jobs (`is_active = false`) will continue to be selected, materialized, and queued for execution.
* **Fix Strategy:** Update the query to filter by `is_active = true`:
  ```sql
  SELECT * FROM scheduled_jobs 
  WHERE next_run_at <= ${now} AND is_active = true
  FOR UPDATE SKIP LOCKED;
  ```

---

### 7. Race Condition: Worker Completes Requeued Jobs (Double-Decrement / Stale Updates)
* **File:** `apps/worker/src/worker/worker.service.ts`
* **Lines:** 150–157 & 181–209
* **Description:** 
  If a worker experiences high event loop lag, the scheduler might falsely mark it offline and run `detectOrphans()`, which changes the job status back to `'queued'` and decrements the queue's `current_running` count.
  When the slow worker recovers and finishes executing the job, it unconditionally updates the job status:
  ```typescript
  this.prisma.job.update({ where: { id: job.id }, data: { status: 'completed' } })
  ```
  Since there is no ownership check, it overwrites the job status to `'completed'`. If another worker had already claimed the requeued job and was running it, this causes a race condition. Additionally, the slow worker decrements `current_running` again, causing a double-decrement (violating concurrency limits or corrupting database counters).
* **Fix Strategy:** Ensure all state updates (completing, rescheduling, or DLQ transition) are performed using conditional updates (`updateMany` checking `claimed_by_worker_id = this.workerId` and `status = 'running'`). If 0 records are updated, the worker has lost ownership and should abort changes without decrementing the queue counters.

---

### 8. Orphaned `JobExecution` Records Left in `'running'` State
* **File:** `apps/worker/src/scheduler/scheduler.service.ts`
* **Lines:** 132–144
* **Description:** 
  When `detectOrphans()` requeues running jobs, it updates the `Job` status to `'queued'` and decrements the queue's load. However, the associated `JobExecution` record created by the original worker remains in the `'running'` state indefinitely.
  This leads to inconsistent database records where executions appear to be permanently running on dead workers.
* **Fix Strategy:** In `detectOrphans()`, find any active `JobExecution` records for the orphaned jobs and update their status to `'failed'` (or `'aborted'`) with a descriptive message ("Worker offline").

---

### 9. Lack of Concurrency Guard on `poll()`
* **File:** `apps/worker/src/worker/worker.service.ts`
* **Lines:** 31 & 64–74
* **Description:** 
  `poll()` is scheduled using `setInterval` every 5 seconds. If a poll cycle takes longer than 5 seconds due to slow DB queries, subsequent invocations of `poll()` will overlap. This leads to concurrent execution of queue processing transactions on the same worker instance, causing it to read stale values of `this.currentLoad` and over-commit its concurrency limit.
* **Fix Strategy:** Use a flag (e.g., `isPolling`) to prevent overlapping executions of `poll()`.

---

### 10. Ungraceful Shutdown of Worker
* **File:** `apps/worker/src/worker/worker.service.ts`
* **Lines:** 35–43
* **Description:** 
  When the worker receives a shutdown signal, `onModuleDestroy()` immediately sets the worker status to `'offline'` and exits. Any currently running jobs (`currentLoad > 0`) are abruptly terminated without waiting for completion, resulting in unnecessary retries or stalled state.
* **Fix Strategy:** Implement a graceful shutdown loop in `onModuleDestroy` that waits (up to a configurable timeout) for `this.currentLoad` to drop to 0 before completing shutdown.

---

## Fix Strategies and Recommendations

To resolve these issues, we recommend the following modifications to `WorkerService` and `SchedulerService`.

### 1. Proposed `WorkerService` Changes (`apps/worker/src/worker/worker.service.ts`)
* **Redis Connection Error Handling:** Add an error listener right after creation.
* **Heartbeat & Polling try-catch:** Ensure all asynchronous interval callbacks catch errors.
* **Job Ownership Validation:** Use `updateMany` with a where clause checking `claimed_by_worker_id` and `status` to ensure changes only apply if ownership is retained.
* **Execution Catch Block:** Ensure all potential rejections in `executeJob` are handled, and that a catch block is attached to the call within `processQueue`.
* **Graceful Shutdown:** Introduce a polling loop to wait for active jobs to complete.

### 2. Proposed `SchedulerService` Changes (`apps/worker/src/scheduler/scheduler.service.ts`)
* **Deactivated Jobs Filter:** Add `AND is_active = true` to `materializeJobs()` raw SQL.
* **Stuck Claimed Jobs Clean Up:** Include `'claimed'` status in `detectOrphans()` where clause.
* **Execution History Update:** Update `JobExecution` records to failed/aborted during orphan detection.
* **Double-Check Status:** Re-verify worker status inside the transaction to avoid race conditions between schedulers.
