# MY STORE — Sales Management Platform

A multi-tenant, multi-branch SaaS platform for managing retail/grocery store sales — POS, inventory, customers, employees, debts, purchasing power, lottery, reporting, and more. Supports both the Gregorian and Afghan Solar Hijri calendars. English-only.

## Architecture

```
Client → Frontend (Next.js) → API (REST /api/v1) → Backend (NestJS) → Database (PostgreSQL)
```

| Layer | Technology | Path |
|---|---|---|
| Backend + API | NestJS 11 + Prisma 6 | `apps/api` |
| Frontend | Next.js 15 + Tailwind 4 | `apps/web` |
| Shared code | TypeScript (constants, types, Afghan calendar) | `packages/shared` |
| Database | PostgreSQL 16 (Docker) | `docker-compose.yml` |

## Prerequisites

- Node.js 20+ and npm 10+
- Docker Desktop (for PostgreSQL and Redis) — or natively installed PostgreSQL 16 / Redis 7

## Setup

```powershell
# 1. Install dependencies
npm install

# 2. Start the database and cache
docker compose up -d

# 3. Environment variables
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env

# 4. Migrate and seed demo data
npm run db:migrate
npm run db:seed

# 5. Run API and Web together
npm run dev
```

- API: http://localhost:4000/api/v1 — Swagger docs: http://localhost:4000/api/docs
- Web: http://localhost:3000

**Demo login:** `admin@demo.af` / `Admin@1234`
