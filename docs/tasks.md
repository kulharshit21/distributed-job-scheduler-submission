# Phased Build Plan (Tasks)

- **Phase 0 — Scaffolding:** monorepo structure, NestJS app, Prisma init, docker-compose (postgres, redis), env config, lint/format setup.
- **Phase 1 — Schema:** all tables from §6 as Prisma migrations, including the partial index on `jobs` and the `(queue_id, idempotency_key)` unique constraint.
- **Phase 2 — Auth:** register/login/refresh, password hashing, JWT guard, roles groundwork.
- **Phase 3 — Projects & Queues:** CRUD + pause/resume + stats endpoint.
- **Phase 4 — Job submission API:** all five submission types (immediate/delayed/scheduled/recurring/batch), idempotency-key handling, validation.
- **Phase 5 — Worker service core:** atomic claim transaction, concurrency-limit enforcement, basic poll loop, job execution + completion/failure transitions.
- **Phase 6 — Retry & DLQ:** backoff calculators, DLQ move-on-exhaustion, requeue-from-DLQ endpoint.
- **Phase 7 — Reliability hardening:** heartbeats, orphan detection/requeue, graceful shutdown, `LISTEN/NOTIFY` wake-up.
- **Phase 8 — Scheduled/cron materializer:** cron parsing, due-scan, leader election lock for multi-replica safety.
- **Phase 9 — Observability:** structured logging with correlation ids, `job_logs`/`job_executions` writes wired through the execution path, `/metrics` endpoint.
- **Phase 10 — Frontend core:** auth pages, project/queue CRUD UI, job explorer, job detail drawer.
- **Phase 11 — Real-time:** Socket.io gateway + Redis pub/sub bridge, dashboard live-patching.
- **Phase 12 — Bonus features:** in the order given in §12, as time allows.
- **Phase 13 — Testing:** unit + integration (concurrency proof) + API + E2E, wired into CI.
- **Phase 14 — Documentation polish:** README, seed script, ARCHITECTURE/ERD/DESIGN_DECISIONS docs, final pass on OpenAPI descriptions.
