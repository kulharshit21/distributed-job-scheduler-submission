# Security and Validation Review Report

## Review Summary

**Verdict**: REQUEST_CHANGES

The security patches and input validation changes implemented in `apps/api` have been evaluated. While many aspects (CORS restriction, WebSocket connection authentication/subscription authorization, and pagination query validation) are conceptually correct and well-implemented, several critical correctness issues and logical gaps prevent approval of this work. Most notably, the cron expression validation and materialization code relies on a non-existent method `cronParser.parseExpression` in the `cron-parser` dependency, leading to immediate runtime crashes. Additionally, batch job creation completely ignores idempotency keys, and CORS origin processing fails on standard whitespace formatting.

---

## Findings

### [Critical] Finding 1: Runtime TypeError Crash in `cron-parser` Usage
- **What**: The application calls `cronParser.parseExpression(...)` which does not exist in `cron-parser` version `^5.6.1`.
- **Where**:
  - `apps/api/src/jobs/dto/create-scheduled-job.dto.ts` (Line 15)
  - `apps/api/src/jobs/jobs.service.ts` (Line 94)
  - `apps/worker/src/scheduler/scheduler.service.ts` (Line 92)
- **Why**: In `cron-parser` v5, the main export (and default export) is the `CronExpressionParser` class. It has a static `parse()` method but does not export `parseExpression` at all. Invoking `cronParser.parseExpression` results in `TypeError: cronParser.parseExpression is not a function` at runtime, causing validation calls and scheduled job creation to crash.
- **Suggestion**: Replace `cronParser.parseExpression` calls with `cronParser.default.parse` or `cronParser.CronExpressionParser.parse`. For example:
  ```typescript
  const cronParser = require('cron-parser');
  const parser = cronParser.default || cronParser.CronExpressionParser;
  parser.parse(value);
  ```

### [Major] Finding 2: Missing Idempotency Key Mapping in Batch Job Creation
- **What**: In `JobsService.createBatch`, the `idempotency_key` property of the `CreateJobDto` array is completely ignored and not saved to the database.
- **Where**: `apps/api/src/jobs/jobs.service.ts` (Lines 66–83)
- **Why**: The Prisma `create` call maps fields like `type`, `payload`, `priority`, and `batch_id`, but omits `idempotency_key`. This violates requirement US-4, which mandates that jobs submitted with a pre-existing idempotency key must return the existing job rather than creating duplicates. Without saving the idempotency key for batch jobs, duplicates will be created.
- **Suggestion**: Map `idempotency_key: dto.idempotency_key` inside the transaction mapper in `createBatch`:
  ```typescript
  return this.prisma.job.create({
    data: {
      queue_id: queueId,
      type: dto.type,
      payload: dto.payload,
      priority: dto.priority || 0,
      status,
      run_at: runAt,
      batch_id: batch.id,
      idempotency_key: dto.idempotency_key, // <-- Map this field!
      max_attempts: 3,
    },
  });
  ```

### [Major] Finding 3: CORS Origin Parsing Space Trim Bug
- **What**: Comma-separated CORS origins in `CORS_ORIGIN` are split but not trimmed of whitespace.
- **Where**:
  - `apps/api/src/main.ts` (Line 23)
  - `apps/api/src/events/events.gateway.ts` (Line 17)
- **Why**: Setting `CORS_ORIGIN` to a common format like `http://localhost:3000, http://localhost:3001` results in `["http://localhost:3000", " http://localhost:3001"]`. The second element's leading space causes CORS preflight checks from that origin to fail.
- **Suggestion**: Trim each split origin:
  ```typescript
  const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
    : false;
  ```

### [Major] Finding 4: Missing Timezone Validation in Scheduled Jobs
- **What**: The optional `timezone` field in `CreateScheduledJobDto` is not validated for correctness.
- **Where**: `apps/api/src/jobs/dto/create-scheduled-job.dto.ts` (Line 40)
- **Why**: If a client provides an invalid IANA timezone (e.g. `"Invalid/Timezone"`), the `IsCronExpression` validator succeeds but `jobs.service.ts` crashes when it calls `.next().toDate()`, throwing `Error: CronDate: unhandled timestamp: Invalid Date`. This bubbles up as a 500 Internal Server Error instead of a 400 Bad Request.
- **Suggestion**: Implement timezone validation or catch errors thrown during execution calculation in `createScheduledJob` and map them to a `BadRequestException`.

---

## Verified Claims

- **Insecure JWT fallback secrets resolved** → verified via file inspection & compilation → **PASS**
  - Fallback strings (`supersecret123`, `superrefresh123`) were removed.
  - Startup checks in `main.ts` guarantee execution halts if `JWT_SECRET` or `JWT_REFRESH_SECRET` are missing.
- **CORS overly permissive origins restricted** → verified via file inspection → **PASS** (with Finding 3 caveats)
  - Defaulting to `false` (block all CORS) if `CORS_ORIGIN` is not defined.
- **WebSockets connection authentication and subscription authorization** → verified via file inspection → **PASS**
  - Gateway correctly verifies tokens on connection and logs/disconnects invalid clients.
  - Subscription verification checks queue owner organization ID matches connection user organization ID.
- **Metrics endpoint unauthorized access** → verified via file inspection → **PASS**
  - Requires `x-metrics-token` or query param `token` matches `METRICS_TOKEN` when defined.
- **CreateJobDto / CreateJobDto[] validation pipe** → verified via file inspection & compilation → **PASS**
  - Recursively validates array payloads and validates single payloads using custom pipe.
- **AddJobLogDto validation** → verified via file inspection → **PASS**
  - Strictly typed DTO mapped to request body.
- **Pagination query parameters validation** → verified via file inspection → **PASS**
  - Integer range parsing with `class-validator` `@Min(1)` and `@Max(100)` applied correctly.
- **Idempotency key unique constraint P2002 conflict resolution** → verified via file inspection → **PASS**
  - Double checks database in catch block for P2002 exceptions.
- **Scheduled job cron expression validation** → verified via compilation & test → **FAIL** (See Finding 1)
  - Validating cron syntax throws a runtime `TypeError` due to incorrect `cron-parser` API usage.

---

## Coverage Gaps

- **Test coverage for JobsService and EventsGateway** — risk level: **High** — recommendation: **Investigate/Add tests**
  - The test suite has only 1 test for `AppController`. There are no unit or integration tests for `JobsService`, `EventsGateway`, or controllers. This is the direct cause of the `cron-parser` runtime error going unnoticed.
- **Security verification under reverse-proxy environments** — risk level: **Low** — recommendation: **Accept risk**

---

## Unverified Items

- None. All requirements were verified via code review and manual runtime environment checking.

---

# Adversarial Challenge Report

## Challenge Summary

**Overall risk assessment**: HIGH

The main structural changes correctly separate tenants, authenticate WebSocket clients, and enforce query constraints. However, the system is fragile because:
1. Core scheduled job APIs crash at runtime on dependency function calls (`cronParser.parseExpression`).
2. Batch execution allows creation of duplicate jobs (no idempotency key mapping), making batch requests unsafe for retries.
3. CORS configuration will fail silently for multi-origin deployments if spaces are present.

---

## Challenges

### [Critical] Challenge 1: Crash-on-invocation for Cron Expressions
- **Assumption challenged**: The worker assumed `cronParser.parseExpression` exists and works out of the box in v5.
- **Attack scenario**: A user hits the create scheduled job endpoint or validation pipe. The Node process throws `TypeError: cronParser.parseExpression is not a function`. If NestJS handles this, it returns 500. If it occurs in a background worker loop, it can crash the daemon/worker.
- **Blast radius**: Complete failure of the Scheduled/Recurring job functionality.
- **Mitigation**: Update calls to `cronParser.default.parse(...)`.

### [High] Challenge 2: Batch Execution Duplicate Inserts
- **Assumption challenged**: The worker assumed idempotency rules do not apply to batch requests or omitted it by mistake.
- **Attack scenario**: If a network timeout occurs during a batch job submission, the client retries the batch request with the same payload (including idempotency keys). The server will write duplicate job records for the entire batch because `idempotency_key` is not saved.
- **Blast radius**: Duplicate processing of entire job batches, leading to data corruption in downstream systems.
- **Mitigation**: Map `idempotency_key` during database insert in `createBatch`.

### [Medium] Challenge 3: CORS Validation Failure under Production Format
- **Assumption challenged**: Assumed `process.env.CORS_ORIGIN` is formatted strictly without spaces.
- **Attack scenario**: A standard config of `http://app1.internal, http://app2.internal` will fail validation for `app2` due to the leading space.
- **Blast radius**: Legitimate client UI requests blocked by CORS.
- **Mitigation**: Trim origins after splitting.

---

## Stress Test Results

- **Multiple concurrent socket subscription attempts (cross-tenant)** → client user context verified → **PASS**
  - The gateway queries database and checks project tenant boundaries correctly.
- **Cron Expression validation with invalid input** → call cron validator → **FAIL** (crashes with TypeError)
- **Pagination query parameter boundaries** → limit set to 0, 101, non-integers, arrays → **PASS** (correctly rejected by class-validator)
