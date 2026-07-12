# Handoff Report — teamwork_preview_explorer_api

This handoff document details the observations, logic chain, caveats, conclusion, and verification methods for the deep scan of `apps/api` (and relevant code in `apps/worker` interacting with the database) for security vulnerabilities and logic/queuing errors.

---

## 1. Observation
The following code patterns, fallback secrets, unvalidated endpoints, and transactional flows were directly observed in the workspace:

### 1.1. Insecure JWT Config & Fallback Secrets
- **File**: `apps/api/src/auth/jwt.strategy.ts` (Line 11):
  ```typescript
  secretOrKey: process.env.JWT_SECRET || 'supersecret123',
  ```
- **File**: `apps/api/src/auth/auth.module.ts` (Line 14):
  ```typescript
  secret: process.env.JWT_SECRET || 'supersecret123',
  ```
- **File**: `apps/api/src/auth/auth.service.ts` (Lines 61, 78):
  ```typescript
  secret: process.env.JWT_REFRESH_SECRET || 'superrefresh123',
  ```

### 1.2. Overly Permissive CORS Config
- **File**: `apps/api/src/main.ts` (Lines 15-18):
  ```typescript
  app.enableCors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true,
    credentials: true,
  });
  ```
- **File**: `apps/api/src/events/events.gateway.ts` (Lines 13-17):
  ```typescript
  @WebSocketGateway({
    cors: {
      origin: '*',
    },
  })
  ```

### 1.3. Missing Authentication/Authorization Guards
- **File**: `apps/api/src/events/events.gateway.ts` (Lines 26, 34-38):
  ```typescript
  handleConnection(client: Socket, ...args: any[]) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  @SubscribeMessage('subscribe_queue')
  handleSubscribeQueue(client: Socket, @MessageBody() queueId: string) {
    client.join(`queue_${queueId}`);
    return { event: 'subscribed', data: queueId };
  }
  ```
- **File**: `apps/api/src/metrics/metrics.controller.ts` (Lines 6-7, 23-28):
  ```typescript
  @Controller('metrics')
  export class MetricsController {
    // ...
    @Get()
    async getMetrics(@Res() res: Response) {
      const stats = await this.prisma.job.groupBy({
        by: ['status'],
        _count: { id: true },
      });
  ```

### 1.4. Incomplete/Missing Input Validation
- **File**: `apps/api/src/jobs/jobs.controller.ts` (Lines 13, 56-59):
  ```typescript
  createJob(@Param('queueId') queueId: string, @Body() dto: CreateJobDto | CreateJobDto[], @Req() req: any)
  
  @Post('jobs/:id/logs')
  addJobLog(@Param('id') id: string, @Body() body: any, @Req() req: any)
  ```

### 1.5. Stuck `'claimed'` Jobs & Incorrect Orphan Requeuing Attempt Decrement
- **File**: `apps/worker/src/worker/worker.service.ts` (Lines 91-107, 143):
  ```typescript
  // claimed inside transaction:
  const claimed = await tx.$queryRaw<any[]>`UPDATE jobs SET status = 'claimed' ...`;
  // ...
  // status changed to running outside transaction:
  await this.prisma.job.update({ where: { id: job.id }, data: { status: 'running', ... } });
  ```
- **File**: `apps/worker/src/scheduler/scheduler.service.ts` (Lines 131-135, 137-140):
  ```typescript
  // detectOrphans only queries running status:
  const jobs = await tx.job.findMany({
    where: { claimed_by_worker_id: worker.id, status: 'running' }
  });
  
  // attempt_count is decremented when requeued:
  data: { status: 'queued', claimed_by_worker_id: null, attempt_count: Math.max(0, job.attempt_count - 1) }
  ```

### 1.6. Missing Try/Catch in Heartbeat & Job Executions
- **File**: `apps/worker/src/worker/worker.service.ts` (Lines 45-62, 120-122):
  ```typescript
  // Heartbeat is not wrapped in a try/catch:
  setInterval(async () => {
    await this.prisma.worker.update({ ... });
    await this.prisma.workerHeartbeat.create({ ... });
  }, 10000);

  // executeJob does not catch failure handler rejections:
  this.executeJob(job).finally(() => {
    this.currentLoad--;
  });
  ```

### 1.7. Background Redis Client Connection Failures
- **File**: `apps/api/src/adapters/redis-io.adapter.ts` (Line 10):
  ```typescript
  const pubClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  ```
- **File**: `apps/worker/src/scheduler/scheduler.service.ts` (Line 19):
  ```typescript
  this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  ```

### 1.8. Concurrent Idempotency Key Creation Failures
- **File**: `apps/api/src/jobs/jobs.service.ts` (Lines 20-39):
  ```typescript
  if (dto.idempotency_key) {
    const existing = await this.prisma.job.findUnique({ ... });
    if (existing) return existing;
  }
  return this.prisma.job.create({ ... });
  ```

---

## 2. Logic Chain

1. **Insecure JWT**: Hardcoded default credentials exist in the source code. In production, if environment configuration fails or the environment variables `JWT_SECRET` / `JWT_REFRESH_SECRET` are not loaded, NestJS automatically uses the hardcoded fallbacks (`supersecret123` / `superrefresh123`). This makes it trivial for an attacker to generate valid JWT signatures.
2. **CORS & WebSocket Vulnerabilities**:
   - `origin: true` dynamically echoes the request origin. In combination with `credentials: true`, any origin can read response data using credentialed requests.
   - The WebSocket gateway has a wildcard origin (`'*'`) and lacks connection handshake authorization, allowing anyone to open a connection.
   - The `subscribe_queue` message handler automatically joins the client socket to the `queue_${queueId}` room without authentication or checks against the client's org membership, leaking real-time execution payloads to arbitrary parties.
3. **Metrics Cross-Tenant Leak**: The `/metrics` endpoint lacks guards and exposes cross-tenant database metrics (`job` status grouping of all rows), which lets unauthenticated external entities access internal statistics.
4. **Union Type/Array Validation Bypass**: `class-validator` does not recursively validate array members of generic union bodies like `CreateJobDto | CreateJobDto[]`. An attacker can submit an array of malformed payloads to `/queues/:queueId/jobs`, bypassing validation checks.
5. **Orphan Recovery & Queue Lockup**:
   - A worker marks a job as `'claimed'` inside a database transaction, but changes it to `'running'` in a separate database call. If the worker crashes between these actions, the job is stuck in `'claimed'`.
   - `detectOrphans` ignores jobs that are in the `'claimed'` status (it only finds `'running'` ones), meaning stuck claimed jobs are never requeued, and the `queues.current_running` counter remains artificially high. This permanently leaks queue capacity.
6. **Poison-Pill Infinite Retries**: When `detectOrphans` finds a dead worker, it decrements the job's `attempt_count`. If a job causes a worker to crash (poison pill), the worker dies, the scheduler decrements the count and requeues it, and another worker picks it up and crashes. This creates an infinite retry loop, wasting computational resources.
7. **Unhandled Promise Rejections**:
   - Asynchronous Redis clients initialized without `.on('error', ...)` handlers will throw uncaught node exceptions if connection drops.
   - Worker heartbeat intervals and `executeJob` calls omit `try/catch` wrappers around asynchronous database updates, leading to uncaught promise rejections that crash worker processes.
8. **Concurrent Idempotency Keys**: Under race conditions, the pre-flight `findUnique` check can pass for concurrent duplicates, causing `prisma.job.create()` to throw unique constraint errors (code `P2002`). Without try/catch handlers, the request crashes with a 500 error instead of resolving the conflict gracefully.

---

## 3. Caveats
- This investigation was purely read-only; no code patches have been applied.
- The behavior of the React SPA dashboard was not examined, but it is expected that it relies on WebSocket events and `/metrics` APIs, meaning fixes to WS and metrics auth must be synchronized with the frontend dashboard.
- The Redis integration was not tested against a live cluster, but logic errors surrounding background connection error handling were confirmed by looking at constructor instantiations.

---

## 4. Conclusion
The API and Worker services suffer from critical security gaps and logic flaws:
- Immediate security threats: Insecure JWT secrets, reflected CORS origins with credentials enabled, publicly exposed tenant metrics, and unauthorized WebSocket queue subscription.
- Critical queuing/logic threats: Jobs orphaned forever in the `'claimed'` state, infinite crash loops for poison-pill jobs due to decremented attempt counts, and unhandled promise rejections that crash worker processes under network lag or database drops.

Remediation requires:
1. Enforcing strict environment checks for JWT keys and CORS origins.
2. Implementing authentication and org-membership validation in the WebSocket gateway.
3. Updating the worker and scheduler query states to handle `'claimed'` jobs and avoid decrementing retry counts.
4. Wrapping async calls in try/catch blocks and registering error listeners on Redis clients.

---

## 5. Verification Method
1. **To Verify JWT Fallback**: Temporarily start the API with `JWT_SECRET=""` and try signing a token with the signature secret `"supersecret123"`. The API will accept it.
2. **To Verify WebSocket Subscription Leak**: Connect using any Socket.io client (e.g. via `wscat` or a local script) without headers or authentication tokens, send the event `subscribe_queue` with a random UUID, and confirm that the subscription succeeds.
3. **To Verify Unhandled Rejections**: Stop Redis locally, then start the API with `REDIS_URL="redis://localhost:9999"` (non-existent). Observe that the node process crashes with an uncaught exception.
4. **To Verify Batch Update Missing Logic**: Create a batch of jobs via `/api/v1/queues/:queueId/jobs`, let workers complete them, and query the `/api/v1/projects/:projectId/queues` or the database directly. Inspect the `batches` table and verify that `completed_jobs`, `failed_jobs`, and `status` remain unmodified.
5. **Run Existing Tests**: Use the project-provided test runner in `apps/api`:
   - Command: `npm run test` inside `apps/api`
   - Command: `npm run test:e2e` inside `apps/api`
