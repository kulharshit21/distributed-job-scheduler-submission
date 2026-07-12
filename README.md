<div align="center">
  <h1>Distributed Job Scheduler</h1>
  <p><strong>A high-performance, fault-tolerant distributed job scheduler built for maximum reliability and concurrency.</strong></p>
  <p><i>Intern Assignment Submission</i></p>

  [![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
  [![NestJS](https://img.shields.io/badge/nestjs-E0234E?style=for-the-badge&logo=nestjs&logoColor=white)](https://nestjs.com/)
  [![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org/)
  [![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
  [![Redis](https://img.shields.io/badge/redis-%23DD0031.svg?style=for-the-badge&logo=redis&logoColor=white)](https://redis.io/)
</div>

<br />

## 🌟 Overview

The Distributed Job Scheduler is an enterprise-grade background task queueing and processing system. Built as a microservices-inspired monorepo, it enables scalable, real-time background task execution while solving distributed problems like race conditions, duplicate processing, and worker node failures.

### Key Features
- **Idempotent Job Submission**: Prevent duplicate processing via client-provided `idempotency_key`.
- **High Concurrency (No Brokers)**: Utilizes PostgreSQL `FOR UPDATE SKIP LOCKED` for lock-free, atomic queue claiming, removing the need for Heavy brokers like Kafka/RabbitMQ.
- **Robust Scheduling**: Supports immediate, delayed, and recurring (CRON) jobs via strict AST parsing.
- **Fault Tolerant**: Built-in Dead Letter Queues (DLQ), configurable retry policies with exponential backoff, and automatic worker orphan detection/requeuing.
- **Real-Time Telemetry**: Real-time Socket.io updates backed by Redis Pub/Sub broadcast infrastructure.
- **Premium UX Dashboard**: Beautiful Glassmorphism React/Vite dashboard allowing deep insights into job execution logs.

---

## 🏗 System Architecture

The architecture relies on decoupled API and Worker services communicating via PostgreSQL for state and Redis for real-time signaling.

<div align="center">
  <a href="https://mermaid.ink/img/pako:eyJjb2RlIjoiZ3JhcGggVERcbiAgICBDbGllbnRbV2ViIERhc2hib2FyZCBSZWFjdC9WaXRlXSAtLT58UkVTVCAmIFdlYlNvY2tldHN8IEFQSVtBUEkgU2VydmljZSBOZXN0SlNdXG4gICAgQVBJIC0tPnxJbnNlcnQgSm9icyAmIEZldGNoIFN0YXRlfCBEQlsoUG9zdGdyZVNRTCldXG4gICAgV29ya2VyW1dvcmtlciBOb2RlIE5lc3RKU10gLS0-fENsYWltIHZpYSBTS0lQIExPQ0tFRHwgREJcbiAgICBBUEkgLS4tPnxQdWJsaXNoIEV2ZW50c3wgUmVkaXNbKFJlZGlzKV1cbiAgICBXb3JrZXIgLS4tPnxQdWJsaXNoIFN0YXR1c3wgUmVkaXNcbiAgICBSZWRpcyAtLi0-fEJyb2FkY2FzdCB0byBDb25uZWN0ZWQgU29ja2V0c3wgQVBJXG4gICAgXG4gICAgY2xhc3NEZWYgc2VydmljZSBmaWxsOiNFMDIzNEUsc3Ryb2tlOiNmZmYsc3Ryb2tlLXdpZHRoOjJweCxjb2xvcjojZmZmO1xuICAgIGNsYXNzRGVmIGNsaWVudCBmaWxsOiMyMDIzMkEsc3Ryb2tlOiM2MURBRkIsc3Ryb2tlLXdpZHRoOjJweCxjb2xvcjojZmZmO1xuICAgIGNsYXNzRGVmIGRhdGFiYXNlIGZpbGw6IzMxNjE5MixzdHJva2U6I2ZmZixzdHJva2Utd2lkdGg6MnB4LGNvbG9yOiNmZmY7XG4gICAgY2xhc3NEZWYgY2FjaGUgZmlsbDojREQwMDMxLHN0cm9rZTojZmZmLHN0cm9rZS13aWR0aDoycHgsY29sb3I6I2ZmZjtcbiAgICBcbiAgICBjbGFzcyBBUEksV29ya2VyIHNlcnZpY2U7XG4gICAgY2xhc3MgQ2xpZW50IGNsaWVudDtcbiAgICBjbGFzcyBEQiBkYXRhYmFzZTtcbiAgICBjbGFzcyBSZWRpcyBjYWNoZTsiLCJtZXJtYWlkIjp7InRoZW1lIjoiZGVmYXVsdCJ9fQ" target="_blank">
    <img src="https://mermaid.ink/img/pako:eyJjb2RlIjoiZ3JhcGggVERcbiAgICBDbGllbnRbV2ViIERhc2hib2FyZCBSZWFjdC9WaXRlXSAtLT58UkVTVCAmIFdlYlNvY2tldHN8IEFQSVtBUEkgU2VydmljZSBOZXN0SlNdXG4gICAgQVBJIC0tPnxJbnNlcnQgSm9icyAmIEZldGNoIFN0YXRlfCBEQlsoUG9zdGdyZVNRTCldXG4gICAgV29ya2VyW1dvcmtlciBOb2RlIE5lc3RKU10gLS0-fENsYWltIHZpYSBTS0lQIExPQ0tFRHwgREJcbiAgICBBUEkgLS4tPnxQdWJsaXNoIEV2ZW50c3wgUmVkaXNbKFJlZGlzKV1cbiAgICBXb3JrZXIgLS4tPnxQdWJsaXNoIFN0YXR1c3wgUmVkaXNcbiAgICBSZWRpcyAtLi0-fEJyb2FkY2FzdCB0byBDb25uZWN0ZWQgU29ja2V0c3wgQVBJXG4gICAgXG4gICAgY2xhc3NEZWYgc2VydmljZSBmaWxsOiNFMDIzNEUsc3Ryb2tlOiNmZmYsc3Ryb2tlLXdpZHRoOjJweCxjb2xvcjojZmZmO1xuICAgIGNsYXNzRGVmIGNsaWVudCBmaWxsOiMyMDIzMkEsc3Ryb2tlOiM2MURBRkIsc3Ryb2tlLXdpZHRoOjJweCxjb2xvcjojZmZmO1xuICAgIGNsYXNzRGVmIGRhdGFiYXNlIGZpbGw6IzMxNjE5MixzdHJva2U6I2ZmZixzdHJva2Utd2lkdGg6MnB4LGNvbG9yOiNmZmY7XG4gICAgY2xhc3NEZWYgY2FjaGUgZmlsbDojREQwMDMxLHN0cm9rZTojZmZmLHN0cm9rZS13aWR0aDoycHgsY29sb3I6I2ZmZjtcbiAgICBcbiAgICBjbGFzcyBBUEksV29ya2VyIHNlcnZpY2U7XG4gICAgY2xhc3MgQ2xpZW50IGNsaWVudDtcbiAgICBjbGFzcyBEQiBkYXRhYmFzZTtcbiAgICBjbGFzcyBSZWRpcyBjYWNoZTsiLCJtZXJtYWlkIjp7InRoZW1lIjoiZGVmYXVsdCJ9fQ" alt="System Architecture Diagram" width="700">
  </a>
  <p><i>Click diagram to zoom in</i></p>
</div>

### Turborepo Structure
- **`@job-scheduler/database`**: Centralized Prisma ORM package with strict schema rules and partial indexing.
- **`apps/api`**: HTTP API and WebSocket gateway.
- **`apps/worker`**: Headless poll loop service. Runs completely isolated from HTTP traffic.
- **`apps/web`**: Frontend interactive application.

---

## 🗄️ Database Entity-Relationship

The database schema is heavily optimized for concurrent write-heavy throughput, enforcing foreign key integrity across Organizations, Projects, Queues, and Execution logs.

<div align="center">
  <a href="https://mermaid.ink/img/pako:eyJjb2RlIjoiZXJEaWFncmFtXG4gICAgT3JnYW5pemF0aW9uIHx8LS1veyBQcm9qZWN0IDogb3duc1xuICAgIE9yZ2FuaXphdGlvbiB8fC0tb3sgVXNlciA6IGhhc1xuICAgIFByb2plY3QgfHwtLW97IFF1ZXVlIDogY29udGFpbnNcbiAgICBRdWV1ZSB8fC0tb3sgSm9iIDogaG9sZHNcbiAgICBKb2IgfHwtLW97IEpvYkV4ZWN1dGlvbiA6IHJlY29yZHNcbiAgICBKb2IgfHwtLW97IEpvYkxvZyA6IGdlbmVyYXRlc1xuICAgIEpvYiB8fC0tb3sgRGVhZExldHRlclF1ZXVlIDogbW92ZXNfdG9cblxuICAgIE9yZ2FuaXphdGlvbiB7XG4gICAgICAgIHN0cmluZyBpZCBQS1xuICAgICAgICBzdHJpbmcgbmFtZVxuICAgIH1cbiAgICBQcm9qZWN0IHtcbiAgICAgICAgc3RyaW5nIGlkIFBLXG4gICAgICAgIHN0cmluZyBuYW1lXG4gICAgICAgIHN0cmluZyBvcmdfaWQgRktcbiAgICB9XG4gICAgUXVldWUge1xuICAgICAgICBzdHJpbmcgaWQgUEtcbiAgICAgICAgc3RyaW5nIG5hbWVcbiAgICAgICAgaW50IGNvbmN1cnJlbmN5X2xpbWl0XG4gICAgICAgIHN0cmluZyBwcm9qZWN0X2lkIEZLXG4gICAgfVxuICAgIEpvYiB7XG4gICAgICAgIHN0cmluZyBpZCBQS1xuICAgICAgICBzdHJpbmcgcXVldWVfaWQgRktcbiAgICAgICAgc3RyaW5nIHR5cGVcbiAgICAgICAganNvbiBwYXlsb2FkXG4gICAgICAgIHN0cmluZyBzdGF0dXNcbiAgICAgICAgaW50IG1heF9yZXRyaWVzXG4gICAgICAgIGludCByZXRyeV9jb3VudFxuICAgICAgICBpbnQgcHJpb3JpdHlcbiAgICAgICAgZGF0ZXRpbWUgbmV4dF9ydW5fYXRcbiAgICAgICAgc3RyaW5nIHdvcmtlcl9pZFxuICAgICAgICBkYXRldGltZSBsb2NrZWRfdW50aWxcbiAgICB9XG4gICAgSm9iRXhlY3V0aW9uIHtcbiAgICAgICAgc3RyaW5nIGlkIFBLXG4gICAgICAgIHN0cmluZyBqb2JfaWQgRktcbiAgICAgICAgc3RyaW5nIHdvcmtlcl9pZFxuICAgICAgICBkYXRldGltZSBzdGFydGVkX2F0XG4gICAgICAgIGRhdGV0aW1lIGNvbXBsZXRlZF9hdFxuICAgICAgICBzdHJpbmcgc3RhdHVzXG4gICAgfVxuICAgIERlYWRMZXR0ZXJRdWV1ZSB7XG4gICAgICAgIHN0cmluZyBpZCBQS1xuICAgICAgICBzdHJpbmcgam9iX2lkIEZLXG4gICAgICAgIHN0cmluZyByZWFzb25cbiAgICB9IiwibWVybWFpZCI6eyJ0aGVtZSI6ImRlZmF1bHQifX0" target="_blank">
    <img src="https://mermaid.ink/img/pako:eyJjb2RlIjoiZXJEaWFncmFtXG4gICAgT3JnYW5pemF0aW9uIHx8LS1veyBQcm9qZWN0IDogb3duc1xuICAgIE9yZ2FuaXphdGlvbiB8fC0tb3sgVXNlciA6IGhhc1xuICAgIFByb2plY3QgfHwtLW97IFF1ZXVlIDogY29udGFpbnNcbiAgICBRdWV1ZSB8fC0tb3sgSm9iIDogaG9sZHNcbiAgICBKb2IgfHwtLW97IEpvYkV4ZWN1dGlvbiA6IHJlY29yZHNcbiAgICBKb2IgfHwtLW97IEpvYkxvZyA6IGdlbmVyYXRlc1xuICAgIEpvYiB8fC0tb3sgRGVhZExldHRlclF1ZXVlIDogbW92ZXNfdG9cblxuICAgIE9yZ2FuaXphdGlvbiB7XG4gICAgICAgIHN0cmluZyBpZCBQS1xuICAgICAgICBzdHJpbmcgbmFtZVxuICAgIH1cbiAgICBQcm9qZWN0IHtcbiAgICAgICAgc3RyaW5nIGlkIFBLXG4gICAgICAgIHN0cmluZyBuYW1lXG4gICAgICAgIHN0cmluZyBvcmdfaWQgRktcbiAgICB9XG4gICAgUXVldWUge1xuICAgICAgICBzdHJpbmcgaWQgUEtcbiAgICAgICAgc3RyaW5nIG5hbWVcbiAgICAgICAgaW50IGNvbmN1cnJlbmN5X2xpbWl0XG4gICAgICAgIHN0cmluZyBwcm9qZWN0X2lkIEZLXG4gICAgfVxuICAgIEpvYiB7XG4gICAgICAgIHN0cmluZyBpZCBQS1xuICAgICAgICBzdHJpbmcgcXVldWVfaWQgRktcbiAgICAgICAgc3RyaW5nIHR5cGVcbiAgICAgICAganNvbiBwYXlsb2FkXG4gICAgICAgIHN0cmluZyBzdGF0dXNcbiAgICAgICAgaW50IG1heF9yZXRyaWVzXG4gICAgICAgIGludCByZXRyeV9jb3VudFxuICAgICAgICBpbnQgcHJpb3JpdHlcbiAgICAgICAgZGF0ZXRpbWUgbmV4dF9ydW5fYXRcbiAgICAgICAgc3RyaW5nIHdvcmtlcl9pZFxuICAgICAgICBkYXRldGltZSBsb2NrZWRfdW50aWxcbiAgICB9XG4gICAgSm9iRXhlY3V0aW9uIHtcbiAgICAgICAgc3RyaW5nIGlkIFBLXG4gICAgICAgIHN0cmluZyBqb2JfaWQgRktcbiAgICAgICAgc3RyaW5nIHdvcmtlcl9pZFxuICAgICAgICBkYXRldGltZSBzdGFydGVkX2F0XG4gICAgICAgIGRhdGV0aW1lIGNvbXBsZXRlZF9hdFxuICAgICAgICBzdHJpbmcgc3RhdHVzXG4gICAgfVxuICAgIERlYWRMZXR0ZXJRdWV1ZSB7XG4gICAgICAgIHN0cmluZyBpZCBQS1xuICAgICAgICBzdHJpbmcgam9iX2lkIEZLXG4gICAgICAgIHN0cmluZyByZWFzb25cbiAgICB9IiwibWVybWFpZCI6eyJ0aGVtZSI6ImRlZmF1bHQifX0" alt="ER Diagram" width="500">
  </a>
  <p><i>Click diagram to zoom in</i></p>
</div>

---

## 🚀 Getting Started

See **[HOW_TO_USE.md](./HOW_TO_USE.md)** for detailed instructions on spinning up the environment via Docker Compose, seeding test data, and starting all the microservices concurrently.

---

## 🛡️ Reliability & Engineering Tradeoffs

### Why PostgreSQL over RabbitMQ/Kafka?
By utilizing `SELECT ... FOR UPDATE SKIP LOCKED`, we can achieve atomic transitions of business logic and queue state in a **single database transaction**. This eliminates the Two-Phase Commit (2PC) problem often encountered when attempting to sync a primary relational database with a distinct message broker.

### Partitioned Rate Limiting
The system features a token bucket approach implemented inside the queue logic, ensuring that strict limits like *'Maximum of 10 concurrent active jobs for Queue A'* are globally respected across distributed worker nodes.

### Zero-Downtime Deployment
Deployments are entirely non-blocking. A worker can crash halfway through a job, and the `locked_until` lease expiration will trigger the Watchdog Daemon to reap and requeue the job automatically.

---
*Developed for the Distributed Systems engineering assignment.*
