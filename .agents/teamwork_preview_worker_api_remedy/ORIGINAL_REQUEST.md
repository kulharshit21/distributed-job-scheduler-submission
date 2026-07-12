## 2026-07-13T01:24:02Z
You are teamwork_preview_worker_api_remedy.
Your working directory is d:\COODITY\.agents\teamwork_preview_worker_api_remedy.
Your task is to fix the issues identified by the reviewer in the API security and validation patches.

Please perform the following:
1. Read the global PROJECT.md at root.
2. Read the reviewer reports at:
   - d:\COODITY\.agents\teamwork_preview_reviewer_api\analysis.md
   - d:\COODITY\.agents\teamwork_preview_reviewer_api\handoff.md
3. Implement these fixes in apps/api:
   a. Fix cron expression parsing and validation runtime crash:
      - In `apps/api/src/jobs/dto/create-scheduled-job.dto.ts` and `apps/api/src/jobs/jobs.service.ts`, import `cron-parser` using `import * as cronParser from 'cron-parser'` or require it correctly, and use `cronParser.parseExpression(...)`.
      - Test/check if `cronParser.parseExpression` or `cronParser.parse` or `cronParser.default.parse` should be used.
      - Ensure that any invalid timezone (e.g. invalid IANA timezone) provided in `dto.timezone` does not crash the server. In `JobsService.createScheduledJob`, wrap the parsing call in a try/catch, catch any error, and throw a `BadRequestException('Invalid cron expression or timezone')`.
   b. Fix missing `idempotency_key` mapping in `createBatch` in `apps/api/src/jobs/jobs.service.ts`:
      - Ensure `idempotency_key: dto.idempotency_key` is correctly mapped when creating jobs inside the batch creation mapping loop.
   c. Fix CORS origin parsing whitespace trim bug in `apps/api/src/main.ts` and `apps/api/src/events/events.gateway.ts`:
      - Use `.map(o => o.trim())` when splitting `process.env.CORS_ORIGIN` by comma to ensure origins with leading/trailing spaces are correctly parsed.
4. Verify that you can build the api application successfully by running `npm run build` in apps/api.
5. Verify that unit tests run and pass by running `npm run test` in apps/api.
6. Create progress.md and handoff.md in your working directory, and send a message to the orchestrator (conversation ID: 539a3dd3-8ec7-41d3-9e4f-cc5503524b03).

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
