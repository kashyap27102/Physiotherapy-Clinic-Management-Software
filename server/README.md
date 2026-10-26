# Physio Clinic Manager: server

REST API for the product. Specs live in [`../docs`](../docs): [API requirements](../docs/API-Requirements.md),
[ER diagram](../docs/ER-Diagram.md), [PRD](../docs/PRD.md).

**Stage: skeleton only.** The server runs and is tested, but there are no database tables, login or business
endpoints yet. Those come next, in this order: schema from the ER diagram, sessions and login, then patients,
visits and payments.

## Stack

Node 24 · Express 5 · TypeScript (strict, ESM) · Prisma 7 (PostgreSQL, `@prisma/adapter-pg`) · zod · pino ·
helmet · cors · express-rate-limit · Vitest + supertest.

Prisma is pinned to **7.10.1**. npm's default `prisma` tag currently points to an 8.0 release candidate, which does
not match the stable client.

## Run

```bash
npm install                 # also needed once: npm run prisma:generate
cp .env.example .env        # optional; the API runs without a database
npm run dev                 # http://localhost:4000/api/v1/health
npm test
npm run typecheck
npm run lint
npm run build && npm start
```

Prisma's generated client lives in `src/generated/` and is git-ignored. Run `npm run prisma:generate` after
cloning and after every schema change.

## Database (when you are ready)

1. Create a hosted development database on Render or Neon.
2. Put its connection string in `.env` as `DATABASE_URL` (Neon needs `?sslmode=require`).
3. Use **test data only** until the legal review on data location is done (PRD section 19, REG-2).
4. `/api/v1/health/ready` then reports `database: "up"`.

## Structure

```
src/
  server.ts            starts the HTTP server, graceful shutdown
  app.ts               builds the Express app (logging, helmet, CORS, JSON, routes, errors)
  config/env.ts        validated environment; the app fails fast on bad config
  lib/                 logger (patient data redacted), errors (API error format and codes)
  middleware/          errorHandler, rateLimit
  db/prisma.ts         lazy Prisma client; the API boots without DATABASE_URL
  routes/index.ts      /api/v1 router, mounts one router per module
  modules/health/      example module: routes (HTTP) -> service (logic); data access joins here later
  generated/           Prisma client (generated, ignored)
prisma/schema.prisma   datasource and generator only, no models yet
prisma.config.ts       Prisma 7 config (loads .env, migrations path)
test/                  API tests
```

New feature modules follow `modules/<name>/<name>.routes.ts` (HTTP and validation) → `<name>.service.ts` (business
rules, permission checks) → data access with Prisma, as in PRD NFR-011.

## Conventions already in place

- **Error format** matches API doc section 2.1: `{ error: { code, message, fields?, details?, requestId } }`. Throw an
  `AppError` (or use helpers such as `notFound()`); anything unexpected becomes a generic 500 and is logged with the
  request id. Records of other clinics must answer `404`, never `403`.
- **Validation:** `parseInput(zodSchema, req.body)` throws a `422` with per-field messages.
- **Logging:** only method, path (never the query string), status and request id are logged. Request bodies are never
  logged, and names, phones, emails, codes and tokens are redacted if logged by hand (PRD NFR-010).
- **Security:** helmet headers, CORS limited to `CORS_ORIGINS`, 100 kB JSON body limit, per-IP rate limit
  (`RATE_LIMIT_PER_MINUTE`), `X-Powered-By` removed. Health endpoints are public and unthrottled.
- **Request id** is returned in the `X-Request-Id` header on every response.

## Endpoints today

| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/health` | Liveness, no data |
| GET | `/api/v1/health/ready` | Readiness; `503` if the database is configured but unreachable. Addition to the API doc |
| GET | `/api/v1/version` | Name and version |

## Decisions recorded

| Topic | Decision |
|---|---|
| Database access | Prisma |
| Development database | Hosted (Render or Neon), test data only |
| Sessions | Server-side sessions stored in PostgreSQL, `httpOnly` cookie, CSRF protection (not built yet) |
| Scope of this step | Skeleton only |
