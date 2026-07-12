# Product Brief

Build a production-inspired distributed job scheduling platform: users create projects, each project owns queues, queues hold jobs (immediate, delayed, scheduled/cron, recurring, batch), a horizontally-scalable worker fleet claims and executes jobs without double-execution, failures retry with configurable backoff and dead-letter after exhausting attempts, and a web dashboard gives full visibility into queues, jobs, workers, and system health.

The grader weighs backend depth over breadth:

| Criterion | Marks | Where covered in this doc |
|---|---|---|
| System Architecture | 20 | §4 |
| Database Design | 20 | §6 |
| Backend Engineering | 20 | §7, §9 |
| Reliability & Concurrency | 15 | §7, §10 |
| Frontend & UX | 10 | §11 |
| API Design | 5 | §8 |
| Documentation | 5 | §13 |
| Testing | 5 | §14 |

**Strategic reading of this table:** architecture + database + backend + reliability = 75 of 100 marks. Frontend is worth a third of what database design alone is worth. Build a clean, functional dashboard — do not chase pixel-perfect UI polish at the expense of the atomic-claim logic, the concurrency test, or the schema's indexing rationale. Effort should be allocated in roughly that proportion. This is the single highest-leverage decision a student misses.
