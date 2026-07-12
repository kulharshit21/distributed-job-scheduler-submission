## 2026-07-13T01:18:21Z
You are teamwork_preview_worker_api.
Your working directory is d:\COODITY\.agents\teamwork_preview_worker_api.
Your objective is to apply security and DTO validation fixes in apps/api.

Please perform the following steps:
1. Read the global PROJECT.md at the project root for context.
2. Read the explorer analysis files at:
   - d:\COODITY\.agents\teamwork_preview_explorer_api\analysis.md
   - d:\COODITY\.agents\teamwork_preview_explorer_api\handoff.md
3. Implement these fixes in apps/api:
   a. In apps/api/src/main.ts:
      - Require process.env.JWT_SECRET and process.env.JWT_REFRESH_SECRET to be defined on startup. Throw an Error if they are missing or empty.
      - Fix CORS origin to use process.env.CORS_ORIGIN.split(',') if configured, otherwise disable CORS (or fallback to false), keeping credentials: true.
   b. Remove fallback secrets 'supersecret123' and 'superrefresh123' from:
      - apps/api/src/auth/jwt.strategy.ts
      - apps/api/src/auth/auth.module.ts
      - apps/api/src/auth/auth.service.ts
   c. Add `verifyToken(token: string)` method to AuthService in apps/api/src/auth/auth.service.ts.
   d. In apps/api/src/events/events.gateway.ts and events.module.ts:
      - Import AuthModule and DatabaseModule in EventsModule.
      - Inject AuthService and PrismaService into EventsGateway.
      - Restrict WebSockets CORS configuration to match allowed CORS origins.
      - Authenticate socket connections in `handleConnection` using `AuthService.verifyToken` by extracting the token from query parameters, auth objects, or headers. Disconnect unauthenticated clients.
      - Authorize subscriptions in `handleSubscribeQueue` by verifying if the authenticated user belongs to the organization that owns the requested queue.
   e. Protect /metrics endpoint in apps/api/src/metrics/metrics.controller.ts:
      - If process.env.METRICS_TOKEN is set, verify that the request contains the token (either in header x-metrics-token or query param token) and reject with 401 Unauthorized if it's missing or incorrect.
   f. Fix CreateJobDto / CreateJobDto[] validation:
      - Create a custom validation pipe/logic in apps/api/src/jobs/dto/create-job-validation.pipe.ts (or directly inside the controller using a custom validation pipe/logic) that validates array elements recursively when an array of CreateJobDto is posted to createJob in jobs.controller.ts.
   g. Fix unvalidated route body parameter in jobs.controller.ts:
      - Create apps/api/src/jobs/dto/add-job-log.dto.ts with proper class-validator decorators and validate addJobLog's body.
   h. Fix unvalidated query parameters (limit, cursor) in jobs.controller.ts, queues.controller.ts, and projects.controller.ts using pagination DTOs or query validation.
   i. Validate cron expressions in CreateScheduledJobDto using a custom class-validator constraint in jobs.dto (or custom validator) that catches invalid cron expressions and returns a 400 Bad Request.
   j. In apps/api/src/jobs/jobs.service.ts, catch Prisma error code P2002 on createJob. If a unique constraint violation occurs on idempotency_key, query findUnique and return the existing job.
4. Verify that you can build the api application successfully by running `npm run build` in apps/api.
5. Create .agents/teamwork_preview_worker_api/progress.md and handoff.md, and send a message to the orchestrator (conversation ID: 539a3dd3-8ec7-41d3-9e4f-cc5503524b03).

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
