# Plan: Distributed Job Scheduler Security, Error, and Bug Audit

## Overview
We will audit and patch the Distributed Job Scheduler codebase in `d:\COODITY`. The focus areas are `apps/api`, `apps/worker`, and `apps/web`. We will follow the Project Pattern and delegate tasks to subagents.

## Phases

### Phase 1: Code Exploration & Deep Audit
- Spawn three parallel `teamwork_preview_explorer` agents to scan `apps/api`, `apps/worker`, and `apps/web` for:
  - Security issues (JWT, CORS, input validation)
  - Queue execution issues, concurrency, unhandled promise rejections
  - Frontend error handling gaps
- Aggregate their findings into a single consolidated audit report.

### Phase 2: Security Patching (Milestone 2)
- Formulate precise fixes for CORS, JWT handling, and input validation based on the audit.
- Dispatch a `teamwork_preview_worker` to implement fixes in `apps/api`.
- Dispatch a `teamwork_preview_reviewer` to check safety and correctness.
- Spawn `teamwork_preview_auditor` to verify integrity.

### Phase 3: Queue & Worker Reliability Fixes (Milestone 3)
- Address unhandled promise rejections, worker concurrency limits, and job claiming/execution logic.
- Dispatch `teamwork_preview_worker` to patch `apps/api` and `apps/worker`.
- Verify with `teamwork_preview_reviewer` and `teamwork_preview_auditor`.

### Phase 4: Frontend Error Handling & UI Gaps (Milestone 4)
- Add error boundary, API request failure handling, and user notifications to `apps/web`.
- Dispatch `teamwork_preview_worker` to modify the frontend.
- Verify with `teamwork_preview_reviewer` and `teamwork_preview_auditor`.

### Phase 5: E2E Verification & Build Checks (Milestone 5)
- Write an E2E testing framework/infrastructure if not already present.
- Create tests covering Tier 1 (Features), Tier 2 (Boundaries), Tier 3 (Combinations), and Tier 4 (Real-World Workloads).
- Verify `npm run build` succeeds globally and for all workspaces.

### Phase 6: Push to Master & Final Report (Milestone 6)
- Perform `git push origin master`.
- Write the final report and summarize patches.
