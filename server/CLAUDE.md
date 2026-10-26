# CLAUDE.md: server

REST API for the physiotherapy clinic product (multi-tenant SaaS, Indian market). Read `../docs/API-Requirements.md`
(endpoints, error format, permission keys, concurrency rules), `../docs/ER-Diagram.md` (tables and constraints) and
`../docs/PRD.md` (business rules `BR-*`, security `SEC-*`) before building a feature. Cite requirement IDs in commits and tests.

**Stage: skeleton only.** Running today: health, readiness and version endpoints. No database models, sessions, login or
business endpoints yet. The planned order is models and first migration, then sessions and login, then patients, visits, payments.

## Commands

```bash
npm run dev                # tsx watch, reads .env if present, :4000
npm test                   # Vitest + supertest (no database needed)
npm run typecheck && npm run lint && npm run build
npm run prisma:generate    # required after cloning and after every schema change
npm run prisma:validate
```

Run typecheck, lint, test and build before saying a change is done.

## Stack

Node 24 · Express 5 · TypeScript 7 (strict, ESM, `noUncheckedIndexedAccess`, `erasableSyntaxOnly`) · Prisma **7.10.1** with
`@prisma/adapter-pg` · zod · pino · helmet · cors · express-rate-limit. Development database is hosted (Render or Neon).

## Layout

```
src/server.ts          listen + graceful shutdown        src/app.ts   builds the Express app
src/config/env.ts      zod-validated env, fails fast     src/lib/     logger, errors
src/middleware/        errorHandler, rateLimit           src/db/prisma.ts   lazy Prisma client
src/routes/index.ts    /api/v1 router                    src/modules/<name>/  one folder per feature
src/generated/         Prisma client (git-ignored)       prisma/schema.prisma + prisma.config.ts
```

Feature module shape (PRD NFR-011): `<name>.routes.ts` (HTTP, `parseInput` validation) → `<name>.service.ts` (business rules and
permission checks) → data access through Prisma. Routes stay thin. `modules/health/` is the template.

## Rules

- **Error format**: always `{ error: { code, message, fields?, details?, requestId } }`. Throw `AppError` or helpers
  (`notFound`, `forbidden`, `validationError`). Use `parseInput(schema, data)` for body, query and params (422 with per-field messages).
  Unexpected errors become a generic 500; never put internals in a message.
- **Tenant isolation**: every query is scoped by the signed-in user's tenant, taken from the session, never from the client.
  A record of another clinic answers **404**, never 403. Add a cross-tenant test for every new endpoint.
- **Authorization** is checked on the server for every action with permission keys (API doc section 4), in the service layer.
- **Money** is `numeric(12,2)` in the database and a string in JSON. No floats. Balances are computed from ledger entries.
- **Append-only**: ledger entries, billing documents, audit entries and versioned clinical rows are never updated or deleted.
  Corrections are reversal entries. The app's database role gets INSERT and SELECT only on those tables.
- **Transactions**: recording a payment, taking a receipt number and reversing an entry each run in one transaction; the
  number comes from locking the `(branch, doc type, financial year)` counter in the same transaction as the ledger insert.
- **Idempotency**: `POST` for visits, payments, refunds, reversals and documents honour the `Idempotency-Key` header.
- **Logging**: only method, path (never the query string), status and request id. Never log request bodies, names, phones,
  emails, codes or tokens (PRD NFR-010). Search terms can be patient names, so keep them out of URLs where possible.
- **Sessions** (decided, not built): server-side sessions in PostgreSQL, `httpOnly` cookie, CSRF protection, instant revoke on
  password change, device revoke and user deactivation.
- **No real patient data** in any development or test database until the legal review on data location is done (PRD REG-2).

## Gotchas

- ESM with `module: nodenext`: relative imports need the `.js` extension (`import { x } from './x.js'`).
- `erasableSyntaxOnly`: no `enum`, no constructor parameter properties, no `namespace`. Declare class fields explicitly.
- Express 5: `req.query` is a read-only getter (do not assign to it); async handlers and rejected promises reach the error
  handler automatically, so no wrapper is needed.
- Prisma 7: the connection URL lives in `prisma.config.ts` (which loads `.env` itself), not in `schema.prisma`; the client is
  generated into `src/generated/prisma` and built through the adapter in `db/prisma.ts`. Pin Prisma to **7.10.1**: npm's default
  `prisma` tag is an 8.0 release candidate that does not match the client.
- Do **not** run `prisma init`. It downloads third-party agent skill files and writes a placeholder `.env` with fake credentials.
- `getPrisma()` throws a 503 `SERVICE_UNAVAILABLE` when `DATABASE_URL` is empty; the app must keep booting without a database.
- Tests set `NODE_ENV=test` and an empty `DATABASE_URL` in `vitest.config.ts`; keep tests independent of a real database
  (integration tests against a real database come with the first migration).
- Keep shell commands simple on Windows: chaining many heredocs in one Bash call can fail to parse; write files with the file tool.
- The folder was renamed from `backend` to `server`. If a rename or delete is ever denied, VS Code's file watcher is the usual cause.

## Not built yet

Prisma models and migrations (from the ER document), sessions and login (email code on new device, trusted devices), role and
permission management, patients, episodes, visits, ledger and receipts, reports, import/export, audit log, super-admin.
Work on a feature branch off `dev`.
