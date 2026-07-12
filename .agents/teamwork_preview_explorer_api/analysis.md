# Security and Logic Analysis of apps/api and apps/worker

This report contains details of security vulnerabilities and logic/queuing errors identified during a code audit of `apps/api` and `apps/worker` in the distributed job scheduler.

---

## 1. Security Vulnerabilities

### 1.1. Insecure JWT Configuration (Weak Fallback Secret)
* **File Path**: 
  - `apps/api/src/auth/jwt.strategy.ts` (Line 11)
  - `apps/api/src/auth/auth.module.ts` (Line 14)
  - `apps/api/src/auth/auth.service.ts` (Lines 61, 78)
* **Lines**:
  ```typescript
  // jwt.strategy.ts
  secretOrKey: process.env.JWT_SECRET || 'supersecret123',

  // auth.module.ts
  secret: process.env.JWT_SECRET || 'supersecret123',

  // auth.service.ts
  secret: process.env.JWT_REFRESH_SECRET || 'superrefresh123',
  ```
* **Explanation**: The authentication system uses hardcoded fallback secrets (`supersecret123` and `superrefresh123`) if the corresponding environment variables `JWT_SECRET` or `JWT_REFRESH_SECRET` are not set or are empty. Since these secrets are visible in public source code, any attacker can forge arbitrary JWT access and refresh tokens, completely bypassing authentication controls and gaining full administrative access.
* **Fix Strategy**: Remove the hardcoded fallback secrets. The application must throw a startup error if `JWT_SECRET` or `JWT_REFRESH_SECRET` are not defined in the environment.
  ```typescript
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is missing');
  }
  ```

### 1.2. Overly Permissive CORS Policy with Credentials Enabled
* **File Path**: `apps/api/src/main.ts` (Lines 15-18)
* **Lines**:
  ```typescript
  app.enableCors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true,
    credentials: true,
  });
  ```
* **Explanation**: When `process.env.CORS_ORIGIN` is not defined, `origin` defaults to `true`. In Express/CORS middleware, setting `origin: true` dynamically reflects the incoming request's `Origin` header in the `Access-Control-Allow-Origin` response header. Combined with `credentials: true`, this allows any third-party website to make credentialed requests (cookies, authorization headers) to the API, exposing users to cross-origin data leaks and Cross-Site Request Forgery (CSRF) style attacks.
* **Fix Strategy**: Do not use `origin: true` in production. Ensure that `origin` defaults to a safe, restricted value (or disable CORS completely if not configured), and validate that the environment variable is strictly checked.
  ```typescript
  const allowedOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : [];
  app.enableCors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : false,
    credentials: true,
  });
  ```

### 1.3. Overly Broad CORS on WebSockets
* **File Path**: `apps/api/src/events/events.gateway.ts` (Lines 13-17)
* **Lines**:
  ```typescript
  @WebSocketGateway({
    cors: {
      origin: '*',
    },
  })
  ```
* **Explanation**: The WebSocket server uses a wildcard CORS policy `origin: '*'`, allowing any website to establish a connection to the WebSocket server.
* **Fix Strategy**: Restrict the WebSocket CORS configuration to match the HTTP API allowed origins.

### 1.4. Missing Authentication & Authorization on WebSocket Subscriptions
* **File Path**: `apps/api/src/events/events.gateway.ts` (Lines 26, 34-38, 40-44)
* **Lines**:
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
* **Explanation**: 
  1. The gateway does not perform any JWT signature verification on connection or subscribe events.
  2. The `subscribe_queue` event allows any connected client to subscribe to updates for any arbitrary `queueId` without verifying if the client is authenticated or belongs to the organization/project that owns that queue. This allows unauthorized cross-tenant data leakage, as job payloads and execution states are broadcast to any socket client joined to that queue's room.
* **Fix Strategy**: 
  - Add an authentication guard or middleware to the WebSocket connection lifecycle. Parse the JWT token from the query parameters or handshake headers and verify it.
  - In `handleSubscribeQueue`, perform a database authorization check (using `PrismaService`) to verify that the authenticated user belongs to the organization that owns the requested queue.

### 1.5. Public Exposure of System Metrics (No Guard / Scope Leak)
* **File Path**: `apps/api/src/metrics/metrics.controller.ts` (Lines 6-38)
* **Lines**:
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
      // ...
  ```
* **Explanation**: The `/metrics` endpoint is not protected by the `JwtAuthGuard`. Anyone can query it to retrieve details about job totals, statuses, and runtime metrics. Furthermore, it executes a database query that groups jobs across all tenants (`groupBy` on the entire `job` table), allowing unauthenticated users to leak global scheduling statistics.
* **Fix Strategy**: 
  - Restrict the metrics endpoint using basic authentication or an API token.
  - Filter metrics to only expose non-sensitive, aggregated, or scoped data, or ensure that scraping is restricted to internal network boundaries (e.g. bind metrics server to localhost or a private port).

### 1.6. Incomplete Input Validation for Union DTOs and Missing Validation on Arrays
* **File Path**: `apps/api/src/jobs/jobs.controller.ts` (Lines 13-18)
* **Lines**:
  ```typescript
  @Post('queues/:queueId/jobs')
  createJob(@Param('queueId') queueId: string, @Body() dto: CreateJobDto | CreateJobDto[], @Req() req: any) {
    if (Array.isArray(dto)) {
      return this.jobsService.createBatch(queueId, req.user.orgId, dto);
    }
    return this.jobsService.createJob(queueId, req.user.orgId, dto);
  }
  ```
* **Explanation**: The endpoint supports creating a single job (`CreateJobDto`) or a batch of jobs (`CreateJobDto[]`). However, NestJS's standard `ValidationPipe` does not automatically validate array elements when a union type like `CreateJobDto | CreateJobDto[]` is declared. As a result, when an array of jobs is submitted, validation is completely bypassed for individual items, enabling clients to submit malformed or malicious payloads.
* **Fix Strategy**: Create a wrapper DTO for batch creation, or implement a custom NestJS validation pipe / decorator that verifies array elements.
  ```typescript
  export class CreateBatchJobDto {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateJobDto)
    jobs!: CreateJobDto[];
  }
  ```

### 1.7. Unvalidated Route Body Parameter (Type Safety/Crash Risk)
* **File Path**: `apps/api/src/jobs/jobs.controller.ts` (Lines 56-59)
* **Lines**:
  ```typescript
  @Post('jobs/:id/logs')
  addJobLog(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.jobsService.addJobLog(id, req.user.orgId, body.message, body.level);
  }
  ```
* **Explanation**: The request body uses the `any` type and receives no validation checks. If the client sends a body where `message` is undefined, `null`, or not a string, it will be passed to `PrismaService` and could trigger database constraint violations or runtime errors.
* **Fix Strategy**: Define a proper `AddJobLogDto` with `class-validator` rules (`@IsString()`, `@IsNotEmpty()`, `@IsOptional()`).

### 1.8. Unvalidated Route Query Parameters
* **File Path**: 
  - `apps/api/src/jobs/jobs.controller.ts` (Line 33)
  - `apps/api/src/queues/queues.controller.ts` (Line 19)
  - `apps/api/src/projects/projects.controller.ts` (Line 19)
* **Lines**:
  ```typescript
  // jobs.controller.ts
  findAllJobs(..., @Query('limit') limit?: string, ...) {
    return this.jobsService.findAllJobs(..., limit ? parseInt(limit) : 25, ...);
  }
  ```
* **Explanation**: The query parameter `limit` is parsed using `parseInt(limit)` without confirming if it is a positive integer. If a client sends `?limit=NaN` or `?limit=-10`, the value is passed directly to the Prisma query `take: limit`, which can cause a database crash or query logic errors.
* **Fix Strategy**: Use `Transform` decorators in a query DTO to parse numbers, combined with validation decorators like `@IsInt()`, `@Min(1)`, and `@Max(100)`.

### 1.9. Unvalidated Cron Expressions
* **File Path**: `apps/api/src/jobs/jobs.service.ts` (Line 84)
* **Lines**:
  ```typescript
  const interval = cronParser.parseExpression(dto.cron_expression, { tz: dto.timezone || 'UTC' });
  ```
* **Explanation**: The `CreateScheduledJobDto` receives a `cron_expression` string, but does not validate its syntax. When parsed by `cronParser.parseExpression`, an invalid cron string will throw a synchronous exception that is not caught, causing a 500 Internal Server Error response.
* **Fix Strategy**: Add a validation step or a custom validator decorator in `CreateScheduledJobDto` that parses the expression during the NestJS validation pipeline, returning a 400 Bad Request if it fails.

---

## 2. Logic and Queuing Errors

### 2.1. Jobs Stuck Forever in `'claimed'` State
* **File Path**: 
  - `apps/worker/src/worker/worker.service.ts` (Lines 91-107, 143)
  - `apps/worker/src/scheduler/scheduler.service.ts` (Lines 131-135)
* **Lines**:
  ```typescript
  // worker.service.ts: processQueue
  const claimed = await tx.$queryRaw<any[]>`
    UPDATE jobs SET status = 'claimed', ...
  `;

  // worker.service.ts: executeJob
  await this.prisma.job.update({ where: { id: job.id }, data: { status: 'running', ... } });

  // scheduler.service.ts: detectOrphans
  const jobs = await tx.job.findMany({
    where: { claimed_by_worker_id: worker.id, status: 'running' }
  });
  ```
* **Explanation**:
  1. The worker changes a job's status to `'claimed'` inside a database transaction (`processQueue`).
  2. Outside of that transaction, it invokes `executeJob`, which performs two separate, non-transactional database updates: creating a `jobExecution` and updating the job's status to `'running'`.
  3. If the worker crashes, loses database connectivity, or is terminated between the claiming transaction and the `'running'` status update, the job will remain stuck in `'claimed'` status indefinitely.
  4. The orphan detection scheduler (`detectOrphans`) only looks for jobs in `'running'` status. It ignores `'claimed'` jobs completely. These jobs remain orphaned forever, and the queue's `current_running` counter is never decremented, eventually locking or reducing the queue's concurrency budget.
* **Fix Strategy**: Update `detectOrphans` to query for jobs in either `'claimed'` or `'running'` status.
  ```typescript
  const jobs = await tx.job.findMany({
    where: { 
      claimed_by_worker_id: worker.id, 
      status: { in: ['claimed', 'running'] } 
    }
  });
  ```

### 2.2. Infinite Retry and Crash Loop on Poison-Pill Jobs
* **File Path**: `apps/worker/src/scheduler/scheduler.service.ts` (Lines 137-140)
* **Lines**:
  ```typescript
  await tx.job.update({
    where: { id: job.id },
    data: { status: 'queued', claimed_by_worker_id: null, attempt_count: Math.max(0, job.attempt_count - 1) }
  });
  ```
* **Explanation**: When `detectOrphans` detects a dead worker, it requeues the jobs that the worker was executing. During this process, it decrements the job's `attempt_count` by `1`. If a job is a "poison pill" (e.g. causes a hard process crash, segfault, or out-of-memory error inside the worker), the worker will crash, go offline, and the scheduler will detect it. The scheduler then decrements the `attempt_count` and requeues the job. Another worker picks up the job, crashes, and the cycle continues infinitely. The job never reaches `max_attempts` to be moved to the Dead-Letter Queue (DLQ), leading to an endless crash loop that can degrade the entire worker cluster.
* **Fix Strategy**: Do not decrement `attempt_count` when requeuing orphaned jobs. If a worker fails to heartbeat, the attempt should count against the job's retry budget. Once the limit is reached, it should be cleanly sent to the DLQ.

### 2.3. Unhandled Promise Rejections in Background Connections
* **File Path**: 
  - `apps/api/src/adapters/redis-io.adapter.ts` (Lines 10-12)
  - `apps/worker/src/scheduler/scheduler.service.ts` (Line 19)
* **Lines**:
  ```typescript
  // redis-io.adapter.ts
  const pubClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  const subClient = pubClient.duplicate();
  ```
* **Explanation**: Instantiating a `new Redis()` starts the connection asynchronously in the background. If the connection fails (e.g. Redis server is down or has auth errors), `ioredis` emits an `'error'` event. If no error listener is attached to the client, this event is thrown as an uncaught exception, which triggers an `UnhandledPromiseRejection` or an `uncaughtException` in Node.js, crashing the entire server/worker.
* **Fix Strategy**: Explicitly register error listeners on all instantiated Redis client instances:
  ```typescript
  pubClient.on('error', (err) => {
    this.logger.error('Redis error:', err);
  });
  ```

### 2.4. Unhandled Promise Rejections in Heartbeat Intervals
* **File Path**: `apps/worker/src/worker/worker.service.ts` (Lines 45-62)
* **Lines**:
  ```typescript
  private startHeartbeat() {
    setInterval(async () => {
      if (!this.isRunning) return;
      await this.prisma.worker.update({ ... });
      await this.prisma.workerHeartbeat.create({ ... });
    }, 10000);
  }
  ```
* **Explanation**: The asynchronous database calls (`worker.update` and `workerHeartbeat.create`) inside the `setInterval` block are not wrapped in a `try/catch`. If the database connection drops temporarily, these promises will reject. Because they run inside an asynchronous callback in `setInterval`, NestJS's global filters cannot catch them, resulting in unhandled promise rejections that can crash the worker process.
* **Fix Strategy**: Wrap the entire logic inside the async heartbeat timer in a `try/catch` block.
  ```typescript
  private startHeartbeat() {
    setInterval(async () => {
      if (!this.isRunning) return;
      try {
        await this.prisma.worker.update({ ... });
        await this.prisma.workerHeartbeat.create({ ... });
      } catch (err) {
        this.logger.error('Heartbeat failed:', err);
      }
    }, 10000);
  }
  ```

### 2.5. Unhandled Rejection inside `executeJob`
* **File Path**: `apps/worker/src/worker/worker.service.ts` (Lines 120-122)
* **Lines**:
  ```typescript
  this.executeJob(job).finally(() => {
    this.currentLoad--;
  });
  ```
* **Explanation**: While `executeJob` has a try/catch block around the handler execution, the success/failure handlers (`handleJobFailure` or the database transactions in the success path) perform database queries. If these queries fail (e.g. database connectivity drops during the updates), `executeJob` throws an exception. Since there is no `.catch()` handler on the promise returned by `executeJob`, this rejection is unhandled.
* **Fix Strategy**: Add a `.catch()` block or wrap the call inside the worker loop to log and suppress execution failures.
  ```typescript
  this.executeJob(job)
    .catch((err) => this.logger.error(`Job execution crash: ${err.message}`))
    .finally(() => {
      this.currentLoad--;
    });
  ```

### 2.6. Total Absence of Batch Progress Updates
* **File Path**: `apps/worker/src/worker/worker.service.ts` (Line 149-210)
* **Explanation**: When jobs belong to a batch (have a `batch_id`), the worker processes and completes/fails them. However, there is no logic in the execution loop to update the `completed_jobs`, `failed_jobs`, or `status` of the `Batch` model in the database. Consequently, all batches remain in `pending` status with `completed_jobs = 0` and `failed_jobs = 0` permanently.
* **Fix Strategy**: Update `executeJob` and `handleJobFailure` to run a database update on the batch table (incrementing `completed_jobs` or `failed_jobs`, and checking if `completed_jobs + failed_jobs == total_jobs` to mark the batch as `'completed'` or `'failed'`).

### 2.7. Split-Brain Leadership Due to Short TTL vs setInterval
* **File Path**: `apps/worker/src/scheduler/scheduler.service.ts` (Lines 23, 42)
* **Lines**:
  ```typescript
  setInterval(() => this.tryAcquireLeader(), 10000); // Try every 10s
  const acquired = await this.redis.set(this.leaderKey, this.leaderInstanceId, 'EX', 15, 'NX'); // TTL 15s
  ```
* **Explanation**: The leader lease TTL is set to 15 seconds, and election runs every 10 seconds. If a scheduler instance undergoes a garbage collection pause, experiences database latency during the `materializeJobs()` transaction, or encounters network lags for over 5 seconds, the Redis lease will expire. Another scheduler instance will then acquire leadership. Once the original leader recovers, both scheduler instances will believe they are the leader (split-brain) and execute the `materializeJobs()` transaction concurrently, causing database locking contention and overhead.
* **Fix Strategy**: Use a much larger lease TTL relative to the check interval (e.g., TTL of 30 seconds with a check interval of 10 seconds), or run a background renewal script (like a Redlock-based lease renewer) while the scheduler is active.

### 2.8. Concurrent Idempotency Key Request Crashes (No Catch for Code `P2002`)
* **File Path**: `apps/api/src/jobs/jobs.service.ts` (Lines 20-39)
* **Lines**:
  ```typescript
  if (dto.idempotency_key) {
    const existing = await this.prisma.job.findUnique({ ... });
    if (existing) return existing;
  }
  return this.prisma.job.create({ ... });
  ```
* **Explanation**: In a highly concurrent environment, two requests with the same `idempotency_key` and `queueId` can simultaneously bypass the `findUnique` pre-flight check. Both will proceed to call `prisma.job.create()`. One will fail with a database unique constraint violation (Prisma error `P2002`). Because this is not caught and handled, it crashes the request handler with a 500 error instead of returning the existing job or a clean ConflictException.
* **Fix Strategy**: Wrap the `create` call in a try/catch. If a Prisma unique constraint violation error is thrown, perform another `findUnique` query and return the existing record if found.
  ```typescript
  try {
    return await this.prisma.job.create({ ... });
  } catch (err: any) {
    if (err.code === 'P2002') {
      const existing = await this.prisma.job.findUnique({ ... });
      if (existing) return existing;
    }
    throw err;
  }
  ```

### 2.9. Unenforced Job Dependencies and Queue Rate Limits
* **Explanation**:
  1. The schema defines `JobDependency` (`job_id` depends on `depends_on_job_id`). However, the polling query in `worker.service.ts:91-107` does not verify if a job's dependencies are completed before claiming it. Thus, jobs execute out-of-order, bypassing dependencies.
  2. The schema defines `rate_limit_per_second` on `Queue`. However, the claiming query in `worker.service.ts` completely ignores this limit, claiming as many jobs as concurrency capacities allow.
* **Fix Strategy**:
  - Update the job claiming query in `processQueue` to exclude jobs whose dependencies are not in a `'completed'` status.
  - Implement token-bucket or sliding-window rate-limiting checks per queue (e.g., using Redis) before claiming jobs in `processQueue`.
