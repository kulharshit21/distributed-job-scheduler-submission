# Distributed Job Scheduler (KiroScheduler)

> A high-performance, fault-tolerant distributed job scheduler built for maximum reliability and concurrency. Designed as a top 1% engineering demonstration.

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![NestJS](https://img.shields.io/badge/nestjs-E0234E?style=for-the-badge&logo=nestjs&logoColor=white)](https://nestjs.com/)
[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/redis-%23DD0031.svg?style=for-the-badge&logo=redis&logoColor=white)](https://redis.io/)

## 🌟 Overview

KiroScheduler is an enterprise-grade distributed job queuing and processing system. It allows organizations to manage, schedule, and execute background tasks reliably at scale.

### Key Features
- **Idempotent Job Submission**: Prevent duplicate processing using `idempotency_key`.
- **High Concurrency**: Utilizes PostgreSQL `FOR UPDATE SKIP LOCKED` for lock-free, atomic queue claiming.
- **Robust Scheduling**: Supports immediate, delayed, recurring (CRON), and batched jobs.
- **Fault Tolerant**: Automatic worker orphan detection, configurable retry policies with backoff, and Dead Letter Queues (DLQ).
- **Real-Time Telemetry**: Real-time Socket.io updates backed by Redis Pub/Sub, plus Prometheus `/metrics` endpoints.
- **Stunning UI**: Beautiful Glassmorphism React/Vite dashboard.

## 🏗 Architecture

The system is organized as a Turborepo monorepo containing:
- **`@job-scheduler/database`**: Centralized Prisma ORM package with strict schema rules and partial indexing for optimization.
- **`apps/api`**: NestJS HTTP server providing the REST API, JWT Authentication, and Socket.io gateway.
- **`apps/worker`**: NestJS headless service running the poll loops, executing jobs, and managing Redis leader-election for cron materialization.
- **`apps/web`**: React + Vite frontend dashboard.

## 🚀 Getting Started

See [HOW_TO_USE.md](./HOW_TO_USE.md) for detailed instructions on spinning up the environment, running the services, and navigating the application.

## 📈 Scalability Highlights

- **Database-Level Locking**: Workers compete for jobs without stepping on each other by utilizing atomic `SKIP LOCKED` queries.
- **Redis Leader Election**: Guarantees exactly-once cron materialization across multiple worker instances.
- **Partitioned Rate Limiting**: Built-in support for queue-specific concurrency limits and Token Bucket rate limiting.

---
*Built with ❤️ for the Distributed Systems Assignment.*
