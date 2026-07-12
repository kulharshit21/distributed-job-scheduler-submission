## 2026-07-13T01:29:13Z
You are teamwork_preview_worker_reliability.
Your working directory is d:\COODITY\.agents\teamwork_preview_worker_reliability.
Your objective is to apply reliability fixes to apps/worker (specifically `apps/worker/src/worker/worker.service.ts` and `apps/worker/src/scheduler/scheduler.service.ts`).

Please perform the following:
1. Read the global PROJECT.md at root.
2. Read the worker explorer analysis files at:
   - d:\COODITY\.agents\teamwork_preview_explorer_worker\analysis.md
   - d:\COODITY\.agents\teamwork_preview_explorer_worker\handoff.md
   - d:\COODITY\.agents\teamwork_preview_explorer_worker\proposed_worker.service.ts (contains most of the proposed worker logic)
   - d:\COODITY\.agents\teamwork_preview_explorer_worker\proposed_scheduler.service.ts (contains most of the proposed scheduler logic)
3. Implement these fixes in apps/worker:
   a. Replace `apps/worker/src/worker/worker.service.ts` and `apps/worker/src/scheduler/scheduler.service.ts` with the proposed worker and scheduler implementations, but make these critical improvements:
   b. In `apps/worker/src/scheduler/scheduler.service.ts`:
      - Fix the attempt count decrement bug inside `detectOrphans`: do NOT decrement `attempt_count` when requeuing orphaned jobs. Set `attempt_count: job.attempt_count`.
      - Fix the cron-parser import/usage. Import `cron-parser` as `* as cronParser` and call `cronParser.default.parse(...)` (or check whatever was successfully reviewed in apps/api to avoid TypeError crashes).
   c. In `apps/worker/src/worker/worker.service.ts`:
      - Implement batch progress updates: when a job completes or fails, check if `job.batch_id` is defined. If so, fetch the Batch, increment `completed_jobs` (on completion) or `failed_jobs` (on failure), and update its status to 'completed' or 'failed' if all jobs in the batch are finished.
      - Implement job dependencies DAG check: update the job claiming raw query in `processQueue` to exclude jobs whose dependencies are not `'completed'` using a `NOT EXISTS` query on `job_dependencies`.
      - Implement queue rate limit check: in `processQueue`, check if the queue has `rate_limit_per_second` set. If so, query the database for the number of jobs claimed in the last second, and subtract this from the capacity to enforce the rate limit per second.
4. Verify that you can build the worker application successfully by running `npm run build` in apps/worker.
5. Create progress.md and handoff.md in your working directory, and send a message to the orchestrator (conversation ID: 539a3dd3-8ec7-41d3-9e4f-cc5503524b03).

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
