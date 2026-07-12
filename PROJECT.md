# Project: Distributed Job Scheduler Audit and Remediation

## Architecture
- Monorepo containing:
  - `apps/api`: NestJS API Server using Prisma and Socket.io.
  - `apps/worker`: NestJS worker service for job claiming and execution.
  - `apps/web`: Vite + React SPA dashboard.
  - `packages/database`: Prisma schema shared between api and worker.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Explore & Audit | Deep scan of api, worker, web for security/errors | None | PLANNED |
| 2 | Security Patching | Fix insecure JWT, input validation, CORS in `api` | M1 | PLANNED |
| 3 | Queue & Worker Fixes | Fix unhandled promise rejections, concurrency bugs, and logic errors in `api` and `worker` | M2 | PLANNED |
| 4 | Frontend Error Handling | Add robust error handling & user feedback in `web` | M3 | PLANNED |
| 5 | E2E Testing & Verification | Verify build & run E2E/integration tests | M4 | PLANNED |
| 6 | Deployment & Push | Commit and push to master branch | M5 | PLANNED |

## Interface Contracts
- API ↔ Web: REST endpoints for auth, projects, queues, jobs, and socket.io namespace for real-time updates.
- API ↔ Worker: Shared database schema via `packages/database` and worker registration/heartbeat endpoints.
