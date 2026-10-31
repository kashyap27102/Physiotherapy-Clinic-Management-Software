# CLAUDE.md: server

REST API for the physiotherapy clinic product (multi-tenant SaaS, Indian market). Read `../docs/API-Requirements.md`
(endpoints, error format, permission keys, concurrency rules), `../docs/ER-Diagram.md` (tables and constraints) and
`../docs/PRD.md` (business rules `BR-*`, security `SEC-*`) before building a feature. Cite requirement IDs in commits and tests.

**Stage: R1 pilot features.** Running: health endpoints, login with email code on new devices, trusted devices,
password reset and change, sessions, clinics/branches/staff/roles, patients, clinical (episodes, assessments, plans, discharge), visits (attendance, notes) and billing (fee, ledger, payments, refunds, reversals, receipts, invoices). Next: audit log viewer, owner dashboard.

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
- **Tenant isolation**: feature modules get their database handle only from `forTenant(tenantId)` (`src/db/tenantScope.ts`), which narrows every read/update/delete to the clinic and stamps every create; never use `getPrisma()` or raw SQL in a feature module. New Prisma models must be given a policy there (compile error otherwise). Every query is scoped by the signed-in user's tenant, taken from the session, never from the client.
  A record of another clinic answers **404**, never 403. Add a cross-tenant test for every new endpoint.
- **Authorization** is checked on the server for every action with permission keys (API doc section 4), in the service layer.
- **Email** goes through `getEmailSender()` (`src/lib/email`, Resend over plain fetch); build messages with `templates.ts`. Unconfigured or failing email answers 503. Tests swap it with `setEmailSender`. Never log recipients, subjects, bodies, codes or links.
- **Money** is `numeric(12,2)` in the database and a string in JSON. No floats. Balances are computed from ledger entries.
- **Append-only**: ledger entries, billing documents, audit entries and versioned clinical rows are never updated or deleted.
  Corrections are reversal entries. The app's database role gets INSERT and SELECT only on those tables.
- **Transactions**: recording a payment, taking a receipt number and reversing an entry each run in one transaction; the
  number comes from locking the `(branch, doc type, financial year)` counter in the same transaction as the ledger insert.
- **Idempotency**: `POST` for visits, payments, refunds, reversals and documents honour the `Idempotency-Key` header.
- **Logging**: only method, path (never the query string), status and request id. Never log request bodies, names, phones,
  emails, codes or tokens (PRD NFR-010). Search terms can be patient names, so keep them out of URLs where possible.
- **Sessions** (built, `src/modules/auth`): server-side sessions in PostgreSQL; the `sid` httpOnly cookie holds an opaque token (only its
  hash is stored). `middleware/session.ts` is the only code that sets `req.auth`, reading permissions fresh on every request. Writes need
  `X-CSRF-Token` (returned by login and `/auth/me`) and an allowed `Origin`. Idle limit 30 min, hard limit 12 h (env). Password change/reset,
  device revoke and deactivation end sessions at once. Passwords are Argon2id via `node:crypto`. Auth tables use the unscoped `getPrisma()`
  on purpose (the tenant client denies them); everything else in a feature module still uses `forTenant`.
- **Registration** (`src/modules/registration`, TEN-001): clinics self-register. A sign-up waits in `pending_registration` until
  its email code is verified; then one transaction creates the clinic, a 14-day trial on the `Pilot` plan, the three roles from
  `auth/roleTemplates.ts` (BR-USR-7) and the owner. An email that already has an account gets the same answer and a decoy id.
  `needsSetup` on the profile is true until the clinic has a branch (`POST /branches`, `modules/branches`).
- **Clinic, branches, staff, roles** (`modules/clinic`, `branches`, `users`, `roles`): the clinic row can only be edited through
  `updateClinicProfile` in `db/tenantScope.ts` (whitelisted fields; the tenant client still refuses tenant updates). The logo is
  raw image bytes in `tenant_logo` (≤200 KB, type sniffed from content). Staff start with an unusable password and get a
  7-day invitation link that reuses `password_reset_token`; `/auth/invitation/accept` sets the password. Branch code lock
  (BR-TEN-2) is `branchHasIssuedDocuments` in `branches.service.ts`, which returns false until billing documents exist. Role
  edits warn (409 `PERMISSION_WARNING`) before leaving only the owner with a key permission. Tests: `test/clinic-staff.db.test.ts`.
- **Patients** (`modules/patients`, PAT-001 to PAT-005): a patient belongs to the clinic, not a branch (BR-PAT-1). `patientRules.ts` holds the pure rules (phone normalisation, age/date of birth, name similarity, search query classification). Duplicate check warns with 409 `DUPLICATE_PATIENT_WARNING` and proceeds with `?confirmDuplicate=true`. Owners must send `branchId` on create; staff always use their own branch. `GET /patients` filters by `branchId`, `gender`, `status`, `phoneContactType`, `registeredFrom/To` (India days) and `sort`, paged. Every open of a patient is audited as `patient.viewed` with the viewer's branch. `balanceFor` and `lastVisitAt` are seams that stay empty until Billing and Visits exist; `activeEpisodeId` is real. `npm run seed:patients` adds 25 fictional patients to the one non-test clinic in a dev database (`-- --reset` replaces them; refuses production). Tests: `test/patientRules.test.ts`, `test/patients.db.test.ts`.
- **Clinical** (`modules/clinical`, CLN-001 to CLN-004): episodes, versioned assessments and treatment plans. One active episode per patient (partial unique index, so a race gives one 201 and one 409 `EPISODE_ALREADY_ACTIVE`). Starting an episode makes the patient `active`; discharge (`episode.manage`, note optional, never blocked by dues) makes them `inactive` and the episode read-only (later writes answer 409 `NO_ACTIVE_EPISODE`). Assessment and plan saves insert the next version (unchanged content returns 200 and creates nothing; a simultaneous clash is 409 `VERSION_CONFLICT`); a database trigger refuses UPDATE and DELETE on both tables for every role, so test cleanup disables it briefly. Reads of assessments, plans and episodes are audited. `clinicalRules.ts` holds the pure rules. Seams: `sessionCount` is 0 and `progress` has no visits until Visits exist; discharge returns `balanceFor` for the dues/credit prompt. Tests: `test/clinicalRules.test.ts`, `test/clinical.db.test.ts`.
- **Visits** (`modules/visits`, VIS-001 to VIS-003): `POST /visits` writes the visit and its CHARGE in one transaction with the fee stored as it was (default from `fee_setting`, or an override that needs `fee.override` and a reason; an amount equal to the default is not an override). Needs an active episode (409 `NO_ACTIVE_EPISODE`); a second visit on the same India day needs `confirmSecondVisitToday` (409 `DUPLICATE_VISIT_TODAY`); dues only warn (`duesWarning`). A visit has no status: "reversed" means its charge has a reversal (DD-3), and `sessionCountForEpisode` counts the rest. Branch-assigned staff always act in their own branch; an owner may send `branchId`, otherwise the episode's branch is used. A forgotten visit is entered with `visitDate` + `backdateReason`, only with `visit.backdate` (owner by default; the owner can grant it to other roles): not future, not before the episode began, stamped midday India time, charge dated that day, audited as `visit.backdated`. Bulk attendance (`visitsBulk.service.ts`, `POST /visits/bulk`, needs `visit.mark` and `visit.bulk`, owner by default): a list of patient and day entries (max 60) saved in one all-or-nothing transaction at the default fee, with the same rules as one visit through the shared `resolveVisitDay` (so an earlier day also needs `visit.backdate` and a reason). Any refused entry fails the whole batch with `details.problems`; duplicates alone answer 409 and succeed when resent with `confirmDuplicates`. Visits are created with `createMany` and ids made in code, with audit rows written in the same transaction. Notes are versioned like assessments. `balanceAfter` and `duesWarning` are null without `ledger.view`. Tests: `test/visits-billing.db.test.ts`.
- **Billing** (`modules/billing`, BILL-001 to BILL-008): `billingRules.ts` is the pure part (paise arithmetic, `entryEffect`, financial year, document numbers); `ledger.ts` holds balances, `issueDocument`, `lockPatientLedger` and `MONEY_TX`. Balance = CHARGE + REFUND − PAYMENT with each REVERSAL cancelling its original, computed on read (`balancesFor`), never stored. Every money write runs in one transaction that first bumps `patient.ledger_revision` (a row lock, so refund-limit and reversal checks cannot race), writes its audit row inside the transaction, and for payments takes the receipt number from `number_sequence` (counter row created beforehand by `ensureSequence`). Numbers: receipts `MUM/2026-27/0001`, reversal receipts `.../R0001`, invoices `.../INV0001`, each its own counter per branch and financial year. Reversing a payment issues a reversal receipt; a reversal cannot be reversed (409 `CANNOT_REVERSE_REVERSAL`) and an entry is reversed once (409 `ALREADY_REVERSED`); branch-assigned staff reverse only their own branch's entries. Back-dating a payment is owner-only. A refund above the credit is 409 `REFUND_EXCEEDS_CREDIT`. Invoices snapshot their lines (DD-5) and leave out reversed visits. Asking again for an invoice whose sessions and total match one already issued (`invoiceFingerprint`: day, description, amount per line, plus the total) returns that invoice (200, `reused: true`) and takes no number; any added or reversed session makes a new, corrected invoice with the next number. PDFs (`documentPdf.ts`, pdfkit) are made on request; the first print is the original, later ones say "DUPLICATE COPY" (tracked through `document.printed` audit rows). Amounts in PDFs read "Rs." because the built-in fonts have no rupee sign.
- **Idempotency** (`lib/idempotency.ts`): `idempotent(req, run)` wraps the visit, payment, refund, reversal and invoice POSTs. It claims the `Idempotency-Key` in `idempotency_key` first, so a repeat returns the stored answer (header `Idempotent-Replay: true`), the same key with a different body is 422 `IDEMPOTENCY_KEY_REUSED`, a repeat while the first is still running is 409 `IDEMPOTENCY_IN_PROGRESS`, and a failed attempt is forgotten so the user can fix it and retry. Validate input _before_ calling it.
- **Database guards**: ledger, visit, note, fee and document tables refuse UPDATE and DELETE through the `refuse_clinical_history_change` trigger; CHECK constraints enforce CON-01 to CON-05 (a CHECK that evaluates to NULL passes, which is why migration `ledger_method_check` exists); a trigger enforces CON-04 and that a reversal matches its original. Test cleanup disables the triggers briefly (see the db tests).
- **Auth tests**: `test/auth.test.ts` needs no database; `test/auth.db.test.ts` runs the whole flow against `TEST_DATABASE_URL` (slow on a hosted DB).
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
- Tests set `NODE_ENV=test` and an empty `DATABASE_URL` in `vitest.config.ts`; keep ordinary tests independent of a real database.
  Database tests are named `*.db.test.ts`, read `TEST_DATABASE_URL` and are skipped without it (set it in `.env`; CI uses a Postgres service).
- Keep shell commands simple on Windows: chaining many heredocs in one Bash call can fail to parse; write files with the file tool.
- The folder was renamed from `backend` to `server`. If a rename or delete is ever denied, VS Code's file watcher is the usual cause.

## Not built yet

Reports, import/export, audit log viewer, super-admin. The optional patient-level fee (`PUT /patients/{id}/fee`) is not built.
Work on a feature branch off `dev`.
