# API Requirements

|              |                                                                                      |
| ------------ | ------------------------------------------------------------------------------------ |
| **Version**  | 1.0                                                                                  |
| **Date**     | 2026-10-26                                                                           |
| **Based on** | [PRD.md](PRD.md), [ER-Diagram.md](ER-Diagram.md), [User-Stories.md](User-Stories.md) |
| **Backend**  | Node.js, Express, TypeScript, PostgreSQL                                             |
| **Consumer** | The React PWA. No public or third-party API in the MVP                               |

This document specifies what the backend must expose. It contains no code. Items marked **Rec** are recommendations to approve. Release tags: **R1** Pilot, **R2** Full MVP.

---

## 1. Principles

1. **REST over HTTPS, JSON bodies**, base path `/api/v1`. Versioned so the app and server can change safely.
2. **Tenant comes from the session, never from the client.** The client does not send a clinic id. Every query is filtered by the signed-in user's tenant (PRD SEC-001).
3. **Authorization is checked on the server for every call**, using permission keys (section 4). Hiding a button is never the control (SEC-006).
4. **Branch comes from the session** for staff assigned to one branch. The owner passes a branch when acting for a branch, and it is validated against the tenant.
5. **Append-only for money and clinical history.** There is no `DELETE` and no `PUT` on ledger entries, billing documents, audit entries, assessments, plans, or notes. Corrections use reversals or new versions (PRD Q25).
6. **Idempotent writes for money and attendance.** The client sends an `Idempotency-Key` header, and a repeated request returns the first result instead of creating a second entry (US-14.8, US-17.6).
7. **Transactions where it matters.** Recording a payment, issuing a receipt number, and reversing an entry each run in one database transaction (ER document, section 6).
8. **No sensitive data in logs or URLs.** Patient names and phone numbers are never written to logs. Searching uses `POST` or a short-lived query where needed (Rec).

## 2. Conventions

| Topic                 | Convention                                                                                                                             |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Format                | JSON, UTF-8. Field names in `camelCase` (database columns stay `snake_case`)                                                           |
| Ids                   | UUID strings                                                                                                                           |
| Money                 | Strings with two decimals, for example `"500.00"`, in INR. Never floating point                                                        |
| Dates and times       | ISO 8601. Times in UTC with offset. The server derives the financial year in India time                                                |
| Pagination            | `?page=1&pageSize=25` (max 100). Responses include `items`, `page`, `pageSize`, `total`                                                |
| Sorting and filters   | `?sort=-visitedAt` and named filters per endpoint                                                                                      |
| Idempotency           | `Idempotency-Key: <uuid>` on `POST` that creates visits, payments, refunds, reversals, and documents. Keys are kept for 24 hours (Rec) |
| Concurrency           | Editable records return a `version`; an update sends it back; a mismatch returns `409`                                                 |
| Content for downloads | PDFs and Excel files return the file with the correct content type and `Content-Disposition`                                           |
| Time zone             | Response times are UTC; the UI converts to India Standard Time                                                                         |

### 2.1 Error format

Every error returns the same shape:

| Field             | Meaning                                               |
| ----------------- | ----------------------------------------------------- |
| `error.code`      | Stable machine code, for example `VALIDATION_FAILED`  |
| `error.message`   | Short English message for display                     |
| `error.fields`    | Optional list of `{ field, message }` for form errors |
| `error.requestId` | Id for support and logs                               |

| HTTP status | Used for                                                                       |
| ----------- | ------------------------------------------------------------------------------ |
| 400         | Malformed request                                                              |
| 401         | Not signed in, session expired, OTP required                                   |
| 403         | Signed in but lacks the permission, or the clinic is suspended                 |
| 404         | Not found, **and also for records of another clinic** (never reveal existence) |
| 409         | Version conflict, duplicate, already reversed, number conflict                 |
| 422         | Validation failed (fields listed)                                              |
| 429         | Rate limited                                                                   |
| 500         | Unexpected error (details only in logs)                                        |

### 2.2 Common error codes

`VALIDATION_FAILED`, `INVALID_CREDENTIALS`, `ACCOUNT_LOCKED`, `OTP_REQUIRED`, `OTP_INVALID`, `PERMISSION_DENIED`, `TENANT_SUSPENDED`, `PLAN_LIMIT_REACHED`, `NOT_FOUND`, `DUPLICATE_PATIENT_WARNING`, `NO_ACTIVE_EPISODE`, `EPISODE_ALREADY_ACTIVE`, `DUPLICATE_VISIT_TODAY`, `FEE_REASON_REQUIRED`, `ALREADY_REVERSED`, `CANNOT_REVERSE_REVERSAL`, `REFUND_EXCEEDS_CREDIT`, `BRANCH_CODE_LOCKED`, `LAST_OWNER`, `VERSION_CONFLICT`, `IDEMPOTENCY_REPLAY`, `RATE_LIMITED`.

## 3. Authentication and sessions

| Requirement | Detail                                                                                                                                                                | Source                 |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| API-AUTH-1  | Session with a secure, `HttpOnly`, `SameSite` cookie holding a short-lived session or access token, plus a refresh mechanism. CSRF protection on state-changing calls | Rec                    |
| API-AUTH-2  | Password hashing with Argon2id or bcrypt. Lockout after repeated failures (Rec: 5 attempts, 15 minutes)                                                               | Rec (SEC-002, SEC-004) |
| API-AUTH-3  | Login returns `OTP_REQUIRED` for unrecognised devices. The OTP step completes the login and can set a trusted-device token (Rec: 30 days)                             | C (Q41)                |
| API-AUTH-4  | Codes and tokens (OTP, reset, device) are stored hashed, expire, and are single use                                                                                   | Rec (DD-8)             |
| API-AUTH-5  | The session carries `userId`, `tenantId`, `branchId`, `roleId`, and a permission set loaded per request, so permission changes apply on the next call                 | Rec                    |
| API-AUTH-6  | Session ends after inactivity (Rec: 30 minutes) and on password change or device revoke                                                                               | Rec                    |
| API-AUTH-7  | Rate limits: login, OTP request and verify, password reset (per account and per IP)                                                                                   | Rec                    |

## 4. Permission keys

The Owner has all of them. Receptionist and Physiotherapist defaults are in PRD section 16. Every endpoint below names the key it needs.

| Key                | Meaning                                               |
| ------------------ | ----------------------------------------------------- |
| `clinic.manage`    | Clinic profile, default fee, settings, branches       |
| `staff.manage`     | Staff accounts                                        |
| `role.manage`      | Edit role permissions                                 |
| `device.manage`    | Revoke other users' trusted devices                   |
| `patient.register` | Create patients                                       |
| `patient.edit`     | Edit demographics                                     |
| `patient.view`     | Search and open patients                              |
| `clinical.view`    | View assessments, plans, notes                        |
| `clinical.edit`    | Edit assessments, plans, notes                        |
| `episode.manage`   | Start episode, discharge                              |
| `visit.mark`       | Mark attendance                                       |
| `visit.backdate`   | Mark attendance for an earlier day (owner by default) |
| `visit.bulk`       | Mark many visits in one go (owner by default)         |
| `fee.override`     | Override the session fee                              |
| `ledger.view`      | See balances and payment history                      |
| `payment.record`   | Record payments                                       |
| `refund.process`   | Process refunds                                       |
| `entry.reverse`    | Reverse entries                                       |
| `document.issue`   | Print receipts, generate invoices                     |
| `report.view`      | Dashboard and reports                                 |
| `data.import`      | Import patients                                       |
| `data.export`      | Export data and reports                               |
| `audit.view`       | View audit log                                        |
| `platform.admin`   | Super-admin only: tenants, plans                      |

## 5. Endpoint catalogue

Notation: **Perm** = permission key required; "any" = any signed-in user. Paths are relative to `/api/v1`. Every endpoint is tenant-scoped unless under `/admin`.

### 5.1 Authentication (AUTH)

| Method | Path                           | Perm            | Req      | Rel | Notes                                                                                                                                             |
| ------ | ------------------------------ | --------------- | -------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/auth/login`                  | public          | AUTH-001 | R1  | Email and password. May return `OTP_REQUIRED`                                                                                                     |
| POST   | `/auth/otp/verify`             | public          | AUTH-002 | R1  | Code plus optional "trust device"                                                                                                                 |
| POST   | `/auth/otp/resend`             | public          | AUTH-002 | R1  | Rate limited                                                                                                                                      |
| POST   | `/auth/logout`                 | any             | AUTH-001 | R1  | Ends session                                                                                                                                      |
| GET    | `/auth/me`                     | any             | AUTH-001 | R1  | User, tenant, branch, role, permission keys, `needsSetup` (clinic has no branch yet), CSRF token                                                  |
| POST   | `/auth/password/forgot`        | public          | AUTH-004 | R1  | Always answers the same                                                                                                                           |
| POST   | `/auth/password/reset`         | public          | AUTH-004 | R1  | Token and new password                                                                                                                            |
| POST   | `/auth/password/change`        | any             | AUTH-004 | R1  | Current and new password                                                                                                                          |
| POST   | `/auth/register`               | public          | TEN-001  | R1  | Clinic name, full name, email, mobile, password, accept terms. Always 202 with `registrationId`; emails a code (or "you already have an account") |
| POST   | `/auth/register/verify`        | public          | TEN-001  | R1  | `registrationId`, code, optional trust device. Creates clinic, 14-day trial, roles, owner; 201 with the session profile                           |
| POST   | `/auth/register/resend`        | public          | TEN-001  | R1  | Rate limited, same spacing as OTP resend                                                                                                          |
| POST   | `/auth/invitation/accept`      | public          | USR-001  | R1  | Token and password for invited staff                                                                                                              |
| GET    | `/auth/devices`                | any             | AUTH-003 | R1  | Own devices                                                                                                                                       |
| DELETE | `/auth/devices/{id}`           | any             | AUTH-003 | R1  | Revoke own device                                                                                                                                 |
| GET    | `/users/{userId}/devices`      | `device.manage` | AUTH-003 | R1  | Owner views a staff member's devices                                                                                                              |
| DELETE | `/users/{userId}/devices/{id}` | `device.manage` | AUTH-003 | R1  | Owner revokes                                                                                                                                     |

### 5.2 Clinic, branches, staff, roles (TEN, USR)

| Method | Path                            | Perm            | Req      | Rel | Notes                                                                                                                                                                                                                                                                             |
| ------ | ------------------------------- | --------------- | -------- | --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/clinic`                       | any             | TEN-001  | R1  | Profile and settings                                                                                                                                                                                                                                                              |
| PATCH  | `/clinic`                       | `clinic.manage` | TEN-001  | R1  | Name, address, phone, receipt details, inactive days                                                                                                                                                                                                                              |
| POST   | `/clinic/logo`                  | `clinic.manage` | TEN-001  | R1  | Raw image body (PNG, JPEG or WebP, checked by content), up to 200 KB; stored in the database                                                                                                                                                                                      |
| GET    | `/clinic/logo`                  | any             | TEN-001  | R1  | The clinic's own logo image; 404 when none. Cache with `?v=<logoVersion>`                                                                                                                                                                                                         |
| DELETE | `/clinic/logo`                  | `clinic.manage` | TEN-001  | R1  | Remove the logo                                                                                                                                                                                                                                                                   |
| GET    | `/clinic/fee`                   | any             | BILL-001 | R1  | Current default fee                                                                                                                                                                                                                                                               |
| PUT    | `/clinic/fee`                   | `clinic.manage` | BILL-001 | R1  | Creates a new fee record with effective date                                                                                                                                                                                                                                      |
| GET    | `/branches/current/therapists`  | `visit.mark`    | VIS-001  | R1  | Physiotherapists in the caller's branch (owner: `?branchId`), id and name only. Needed for the "treating physiotherapist" choice when marking attendance, because receptionists lack `staff.manage`. Added during client scaffolding                                              |
| GET    | `/branches`                     | any             | TEN-002  | R1  | Owner sees all; staff see their own                                                                                                                                                                                                                                               |
| POST   | `/branches`                     | `clinic.manage` | TEN-002  | R1  | Checks plan limit                                                                                                                                                                                                                                                                 |
| PATCH  | `/branches/{id}`                | `clinic.manage` | TEN-002  | R1  | `BRANCH_CODE_LOCKED` after first document                                                                                                                                                                                                                                         |
| POST   | `/branches/{id}/deactivate`     | `clinic.manage` | TEN-002  | R1  | Blocked if active staff remain                                                                                                                                                                                                                                                    |
| POST   | `/branches/{id}/reactivate`     | `clinic.manage` | TEN-002  | R1  | Added: undo a deactivation                                                                                                                                                                                                                                                        |
| GET    | `/users`                        | `staff.manage`  | USR-001  | R1  | Filter by role, branch, active                                                                                                                                                                                                                                                    |
| POST   | `/users`                        | `staff.manage`  | USR-001  | R1  | Sends invitation; checks plan limit                                                                                                                                                                                                                                               |
| PATCH  | `/users/{id}`                   | `staff.manage`  | USR-001  | R1  | Name, role, branch                                                                                                                                                                                                                                                                |
| POST   | `/users/{id}/deactivate`        | `staff.manage`  | USR-001  | R1  | `LAST_OWNER` guard                                                                                                                                                                                                                                                                |
| POST   | `/users/{id}/reactivate`        | `staff.manage`  | USR-001  | R1  |                                                                                                                                                                                                                                                                                   |
| POST   | `/users/{id}/resend-invitation` | `staff.manage`  | USR-001  | R1  | Added: new invitation link for someone who has not signed in yet; the old link stops working                                                                                                                                                                                      |
| GET    | `/roles`                        | `role.manage`   | USR-002  | R1  | Roles with their permission keys                                                                                                                                                                                                                                                  |
| GET    | `/permissions`                  | `role.manage`   | USR-002  | R1  | Catalogue of keys with descriptions                                                                                                                                                                                                                                               |
| PUT    | `/roles/{id}/permissions`       | `role.manage`   | USR-002  | R1  | Replace the set; audit logged; owner role not editable. Removing a key permission (record payments, mark attendance, register or open patients) that no other staff role holds answers 409 `PERMISSION_WARNING` with `details.warnings` until resent with `confirmWarnings: true` |

### 5.3 Patients (PAT)

| Method | Path                      | Perm               | Req      | Rel | Notes                                                                                                                                                                           |
| ------ | ------------------------- | ------------------ | -------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/patients`               | `patient.view`     | PAT-002  | R1  | `q` (name, or 4+ phone digits), filters `branchId` (registering branch), `gender`, `status`, `phoneContactType`, `registeredFrom`/`registeredTo` (India dates), `sort` (`newest | oldest | name | name_desc`), `page`, `pageSize` (max 50). Rows include registering branch, registered date, last visit, dues indicator |
| POST   | `/patients`               | `patient.register` | PAT-001  | R1  | Mandatory: name, phone, age or date of birth, gender. Returns duplicate candidates; `?confirmDuplicate=true` to proceed                                                         |
| GET    | `/patients/{id}`          | `patient.view`     | PAT-003  | R1  | Header and overview. Logs a view                                                                                                                                                |
| PATCH  | `/patients/{id}`          | `patient.edit`     | PAT-004  | R1  | Audit with before and after                                                                                                                                                     |
| GET    | `/patients/{id}/balance`  | `ledger.view`      | BILL-002 | R1  | Dues or advance credit, computed from the ledger                                                                                                                                |
| GET    | `/patients/{id}/visits`   | `patient.view`     | VIS-003  | R1  | All episodes and branches, newest first                                                                                                                                         |
| GET    | `/patients/{id}/ledger`   | `ledger.view`      | BILL-002 | R1  | Entries with branch tags; reversed entries marked                                                                                                                               |
| GET    | `/patients/{id}/episodes` | `patient.view`     | CLN-001  | R1  |                                                                                                                                                                                 |
| GET    | `/patients/inactive`      | `report.view`      | INA-001  | R2  | Active episodes with no visit in N days                                                                                                                                         |

### 5.4 Clinical (CLN)

| Method | Path                             | Perm             | Req     | Rel | Notes                                                                   |
| ------ | -------------------------------- | ---------------- | ------- | --- | ----------------------------------------------------------------------- |
| POST   | `/patients/{id}/episodes`        | `episode.manage` | CLN-001 | R1  | `EPISODE_ALREADY_ACTIVE` if one exists                                  |
| GET    | `/episodes/{id}`                 | `clinical.view`  | CLN-001 | R1  | With latest assessment, plan, session count. Logs a view                |
| POST   | `/episodes/{id}/assessments`     | `clinical.edit`  | CLN-002 | R1  | Creates the next version                                                |
| GET    | `/episodes/{id}/assessments`     | `clinical.view`  | CLN-002 | R1  | All versions                                                            |
| POST   | `/episodes/{id}/treatment-plans` | `clinical.edit`  | CLN-003 | R1  | Creates the next version                                                |
| GET    | `/episodes/{id}/treatment-plans` | `clinical.view`  | CLN-003 | R1  | All versions                                                            |
| POST   | `/episodes/{id}/discharge`       | `episode.manage` | CLN-004 | R1  | Optional note. Returns the balance for the prompt; never blocks on dues |

### 5.5 Visits (VIS)

| Method | Path                   | Perm                        | Req      | Rel | Notes                                                                                                                                                                                                                                                                                                                                                                          |
| ------ | ---------------------- | --------------------------- | -------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/visits/today`        | `patient.view`              | VIS-001  | R1  | The caller's branch (owner: `?branchId`). Includes dues indicator and payment status                                                                                                                                                                                                                                                                                           |
| POST   | `/visits/bulk`         | `visit.mark` + `visit.bulk` | VIS-001  | R1  | Body: `entries` `[{ patientId, date }]` (up to 60), optional `therapistId`, `branchId`, `reason`, `confirmDuplicates`. One all-or-nothing save at the default fee. An earlier `date` also needs `visit.backdate` and a `reason`. Any refused entry answers 422 (or 409 `DUPLICATE_VISIT_TODAY` when only duplicates) with `details.problems`, and nothing is saved. Idempotent |
| POST   | `/visits`              | `visit.mark`                | VIS-001  | R1  | Body: patient, optional therapist, optional fee override with reason. Creates visit and charge in one transaction. Idempotent. Returns dues warning data                                                                                                                                                                                                                       |
| GET    | `/visits/{id}`         | `patient.view`              | VIS-003  | R1  |                                                                                                                                                                                                                                                                                                                                                                                |
| POST   | `/visits/{id}/notes`   | `clinical.edit`             | VIS-002  | R1  | Creates the next note version                                                                                                                                                                                                                                                                                                                                                  |
| GET    | `/visits/{id}/notes`   | `clinical.view`             | VIS-002  | R1  | All versions                                                                                                                                                                                                                                                                                                                                                                   |
| POST   | `/visits/{id}/reverse` | `entry.reverse`             | BILL-005 | R1  | Reason required. Reverses the charge                                                                                                                                                                                                                                                                                                                                           |

Rules enforced: `NO_ACTIVE_EPISODE`, `DUPLICATE_VISIT_TODAY` (needs `confirm=true`), `FEE_REASON_REQUIRED`. Branch always comes from the session for branch-assigned staff.

### 5.6 Billing (BILL)

| Method | Path                           | Perm             | Req      | Rel | Notes                                                                                                                                                      |
| ------ | ------------------------------ | ---------------- | -------- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/payments`                    | `payment.record` | BILL-003 | R1  | Patient, amount, method, optional reference, date. Creates ledger entry and receipt in one transaction. Idempotent. Returns receipt number and new balance |
| POST   | `/refunds`                     | `refund.process` | BILL-004 | R1  | Patient, amount, method, reason. `REFUND_EXCEEDS_CREDIT`. Idempotent                                                                                       |
| POST   | `/ledger-entries/{id}/reverse` | `entry.reverse`  | BILL-005 | R1  | Reason required. `ALREADY_REVERSED`, `CANNOT_REVERSE_REVERSAL`. For a payment, issues a reversal receipt                                                   |
| GET    | `/ledger-entries/{id}`         | `ledger.view`    | BILL-002 | R1  | Entry with its reversal link                                                                                                                               |
| GET    | `/documents/{id}`              | `document.issue` | BILL-006 | R1  | Metadata                                                                                                                                                   |
| GET    | `/documents/{id}/pdf`          | `document.issue` | BILL-006 | R1  | Receipt or invoice PDF; reprints marked "duplicate copy" (Rec)                                                                                             |
| POST   | `/invoices`                    | `document.issue` | BILL-007 | R1  | Patient with episode or date range. Stores a lines snapshot and takes the next invoice number                                                              |
| GET    | `/patients/{id}/documents`     | `document.issue` | BILL-006 | R1  |                                                                                                                                                            |
| PUT    | `/patients/{id}/fee`           | `fee.override`   | BILL-001 | R1  | Optional patient-level fee (Rec)                                                                                                                           |

### 5.7 Dashboard, reports, export (REP, EXP)

| Method | Path                     | Perm          | Req     | Rel | Notes                                                                                          |
| ------ | ------------------------ | ------------- | ------- | --- | ---------------------------------------------------------------------------------------------- |
| GET    | `/dashboard/today`       | `report.view` | REP-001 | R1* | Patients seen, collections, dues. `?branchId` optional. *May move to R2                        |
| GET    | `/reports/revenue`       | `report.view` | REP-002 | R2  | `from`, `to`, `groupBy=day                                                                     | week                                           | month`, `branchId`, `basis=collections | charges` |
| GET    | `/reports/outstanding`   | `report.view` | REP-002 | R2  | Patients with dues, sorted by amount                                                           |
| GET    | `/reports/by-branch`     | `report.view` | REP-002 | R2  | Visits and revenue per branch                                                                  |
| GET    | `/reports/by-method`     | `report.view` | REP-002 | R2  | Cash, UPI, card, bank transfer                                                                 |
| GET    | `/reports/{name}/export` | `data.export` | REP-003 | R2  | `format=xlsx                                                                                   | pdf`; same filters as the report; audit logged |
| POST   | `/exports`               | `data.export` | EXP-001 | R2  | Request a clinic data export (patients, visits, payments). Large exports run in the background |
| GET    | `/exports/{id}`          | `data.export` | EXP-001 | R2  | Status and download link                                                                       |

### 5.8 Import (IMP)

| Method | Path                     | Perm          | Req     | Rel | Notes                                                        |
| ------ | ------------------------ | ------------- | ------- | --- | ------------------------------------------------------------ |
| GET    | `/imports/template`      | `data.import` | IMP-001 | R2  | Excel template                                               |
| POST   | `/imports`               | `data.import` | IMP-001 | R2  | Upload file (type and size limits); returns detected columns |
| PUT    | `/imports/{id}/mapping`  | `data.import` | IMP-001 | R2  | Column mapping                                               |
| POST   | `/imports/{id}/validate` | `data.import` | IMP-001 | R2  | Row-level errors and duplicates, nothing saved               |
| POST   | `/imports/{id}/commit`   | `data.import` | IMP-001 | R2  | Creates patients; returns counts                             |
| POST   | `/imports/{id}/rollback` | `data.import` | IMP-001 | R2  | Deactivates patients created by this import                  |
| GET    | `/imports/{id}`          | `data.import` | IMP-001 | R2  | Status and result report                                     |

### 5.9 Audit (AUD)

| Method | Path         | Perm         | Req     | Rel | Notes                                                                     |
| ------ | ------------ | ------------ | ------- | --- | ------------------------------------------------------------------------- |
| GET    | `/audit-log` | `audit.view` | AUD-001 | R1  | Filters: `userId`, `patientId`, `action`, `from`, `to`, `branchId`; paged |

There is no write endpoint. Entries are created by the server as a side effect of other calls.

### 5.10 Platform administration (ADM, SUB), super-admin only

| Method | Path                               | Perm             | Req     | Rel | Notes                                                                                      |
| ------ | ---------------------------------- | ---------------- | ------- | --- | ------------------------------------------------------------------------------------------ |
| POST   | `/admin/tenants`                   | `platform.admin` | ADM-001 | R2  | Clinic plus first owner; sends invitation. Optional: clinics self-register in R1 (TEN-001) |
| GET    | `/admin/tenants`                   | `platform.admin` | ADM-001 | R2  | Status, plan, trial end, counts                                                            |
| GET    | `/admin/tenants/{id}`              | `platform.admin` | ADM-001 | R2  | Platform data only, no patient records (OQ-10)                                             |
| POST   | `/admin/tenants/{id}/suspend`      | `platform.admin` | ADM-001 | R2  |                                                                                            |
| POST   | `/admin/tenants/{id}/reactivate`   | `platform.admin` | ADM-001 | R2  |                                                                                            |
| PUT    | `/admin/tenants/{id}/subscription` | `platform.admin` | SUB-001 | R2  | Plan, status, trial end                                                                    |
| GET    | `/admin/plans`                     | `platform.admin` | SUB-001 | R2  |                                                                                            |
| POST   | `/admin/plans`                     | `platform.admin` | SUB-001 | R2  | Limits and feature flags                                                                   |
| PATCH  | `/admin/plans/{id}`                | `platform.admin` | SUB-001 | R2  | Applies without a release                                                                  |
| GET    | `/admin/audit-log`                 | `platform.admin` | ADM-001 | R2  | Platform-level events                                                                      |

### 5.11 System

| Method | Path       | Perm   | Notes                                |
| ------ | ---------- | ------ | ------------------------------------ |
| GET    | `/health`  | public | Liveness for hosting checks. No data |
| GET    | `/version` | public | App version (optional)               |

## 6. Key request and response content

Only the fields that matter for behaviour. Field names are indicative.

### 6.1 `POST /patients`

- **Request:** `fullName`, `phone`, `age` or `dateOfBirth`, `gender` (mandatory); optional `address`, `emergencyContact`, `occupation`, `referringDoctor`, `email`, `notes`, `phoneContactType`.
- **Response 201:** the patient with `id`, registering branch, and `status`.
- **Response 409 `DUPLICATE_PATIENT_WARNING`:** list of candidates (name, phone, last visit). Resend with `confirmDuplicate=true` to create anyway.

### 6.2 `POST /visits`

- **Request:** `patientId`, optional `therapistId`, optional `feeOverride` `{ amount, reason }`, optional `confirmSecondVisitToday`, optional `visitDate` (`YYYY-MM-DD`, an earlier India day) with `backdateReason`. An earlier `visitDate` needs `visit.backdate` (403 otherwise), a reason, and a day that is neither in the future nor before the episode started (422).
- **Response 201:** `visit`, `charge` entry, `sessionNumber`, `planProgress` (for example 6 of 10, with `planExceeded`), `balanceAfter`, and `duesWarning` `{ amount }` when the patient owed money before this visit.

### 6.3 `POST /payments`

- **Request:** `patientId`, `amount`, `method` (`cash|upi|card|bank_transfer`), optional `reference`, optional `date` (back-dating only for the owner, Rec A-10).
- **Response 201:** `entry`, `receipt` `{ id, number }`, `balanceAfter` (dues or advance credit).

### 6.4 `POST /ledger-entries/{id}/reverse`

- **Request:** `reason` (required).
- **Response 201:** the reversal entry, the original with `reversedBy`, `reversalReceipt` for payments, and the new balance.

### 6.5 `GET /patients/{id}/balance`

- **Response:** `balance` (string), `state` (`due|credit|zero`), `byBranch` breakdown, and `asOf`.

### 6.6 `PUT /roles/{id}/permissions`

- **Request:** `permissions` (list of keys).
- **Response:** the saved set plus any `warnings` (for example "no role can record payments").

## 7. Business rules the API must enforce

| Rule                                                                   | Enforced at                                               |
| ---------------------------------------------------------------------- | --------------------------------------------------------- |
| Tenant isolation (BR-TEN-1)                                            | Every query; tests for cross-tenant access                |
| Staff act only in their branch (BR-USR-1)                              | Visit and payment creation                                |
| One active episode per patient (BR-CLN-2)                              | Episode creation; partial unique index                    |
| Attendance needs an active episode (CLN-001)                           | `POST /visits`                                            |
| Fee stored at the time of the visit (BR-BILL-1)                        | `POST /visits`                                            |
| Fee override needs permission and reason (BILL-001)                    | `POST /visits`                                            |
| Dues never block a visit (BR-VIS-4)                                    | `POST /visits` returns warning only                       |
| Ledger is append-only (BR-BILL-4)                                      | No update or delete routes; database privileges (SEC-008) |
| Refund cannot exceed credit (BR-BILL-12)                               | `POST /refunds`, checked in the transaction               |
| One reversal per entry; no reversal of a reversal (BR-BILL-15)         | Reverse endpoints and unique constraint                   |
| Receipt numbers per branch per financial year, no gaps (BR-BILL-17/18) | Same transaction as the ledger insert                     |
| Branch code locked after first document (BR-TEN-2)                     | `PATCH /branches/{id}`                                    |
| Last owner cannot be deactivated (USR-001)                             | `POST /users/{id}/deactivate`                             |
| Plan limits (SUB-001)                                                  | Branch, user, and patient creation (R2)                   |
| Discharged patients return via a new episode (BR-CLN-8)                | Episode creation                                          |

## 8. Audit events

Written by the server for each of these (AUD-001): login success and failure, OTP, device trust and revoke, password change and reset, **patient view**, patient edit, episode start and discharge, assessment, plan, and note versions, attendance, payment, refund, reversal, fee override, document issue and reprint, permission change, staff change, branch change, import and rollback, export, tenant suspend and reactivate, plan change.

Each entry holds user, tenant, branch, action, target type and id, time, IP address, and a details object (before and after values, reasons). The application database user can insert and read these rows only.

## 9. Non-functional requirements for the API

| ID         | Requirement                                                                                                  | Source              |
| ---------- | ------------------------------------------------------------------------------------------------------------ | ------------------- |
| API-NFR-1  | 95% of normal calls complete in under 500 ms at 25 clinics                                                   | Rec (NFR-004)       |
| API-NFR-2  | Patient search under 300 ms with indexes on phone and name (ER section 5.3)                                  | Rec                 |
| API-NFR-3  | Receipt and invoice PDFs generate in under 3 s                                                               | Rec                 |
| API-NFR-4  | Reports for up to 12 months of one clinic return in under 5 s, or run in the background                      | Rec                 |
| API-NFR-5  | Request body size limit, upload type and size limits, and input validation on every endpoint                 | Rec (SEC-005)       |
| API-NFR-6  | Security headers, CORS limited to the app's origin, TLS only                                                 | Rec (SEC-003)       |
| API-NFR-7  | Structured logs with request id, no patient data or secrets                                                  | C-aligned (NFR-010) |
| API-NFR-8  | A health endpoint and error monitoring                                                                       | Rec                 |
| API-NFR-9  | Rate limits: general per user, stricter on auth endpoints                                                    | Rec                 |
| API-NFR-10 | No host-specific features, so the service can move off Render                                                | C (Q40)             |
| API-NFR-11 | Automated tests for tenant isolation, each permission, ledger rules, and receipt numbering under concurrency | Rec (NFR-011)       |

## 10. Concurrency and consistency

- **Two users, one patient.** Balances are computed from the ledger inside the transaction that checks them (refund limit, reversal). No stored balance can drift.
- **Receipt numbers.** Allocated by locking the branch, document type, and financial year counter in the same transaction as the ledger insert. Failure rolls back the number.
- **Double submit.** `Idempotency-Key` returns the first result for a repeat.
- **Editable records** (patient, clinic, branch, staff) use a `version` field; a stale update returns `409 VERSION_CONFLICT`.
- **Network failure.** The app must treat a timeout as "unknown" and re-send with the same `Idempotency-Key`, never create a second entry.

## 11. Files and documents

| Item                  | Requirement                                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Logo upload           | Image types only, size limit (Rec: 1 MB), stored by the platform, served with the clinic profile                                                 |
| Receipts and invoices | Generated as PDF on request from stored data and a lines snapshot. They need not be stored as files (Rec); reprints regenerate identical content |
| Import files          | Excel only, size and row limits (Rec: 5 MB, 5,000 rows), deleted after processing (Rec)                                                          |
| Exports               | Created on request, available for a short time (Rec: 24 hours), then deleted                                                                     |
| Patient documents     | **Out of scope for the MVP**                                                                                                                     |

## 12. Not in the MVP API

Appointments and calendar; availability; reminders; WhatsApp and SMS; patient documents; exercise library; progress measures; expenses; packages; patient-facing endpoints; webhooks; public or partner API; subscription payment collection; offline sync.

## 13. Requirement coverage

| PRD requirement                    | Endpoint groups            |
| ---------------------------------- | -------------------------- |
| AUTH-001 to AUTH-004               | 5.1                        |
| TEN-001, TEN-002, USR-001, USR-002 | 5.2, 5.10                  |
| PAT-001 to PAT-005                 | 5.3                        |
| CLN-001 to CLN-004                 | 5.4                        |
| VIS-001 to VIS-003                 | 5.5                        |
| BILL-001 to BILL-008               | 5.2 (fee), 5.5, 5.6        |
| REP-001 to REP-003, EXP-001        | 5.7                        |
| IMP-001                            | 5.8                        |
| AUD-001                            | 5.9                        |
| ADM-001, SUB-001                   | 5.10                       |
| INA-001                            | 5.3 (`/patients/inactive`) |

## 14. Open items to confirm

| ID       | Question                                               | Recommendation                                                                                  |
| -------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| API-OQ-1 | Session mechanism: cookie session or token pair        | Cookie-based session with CSRF protection, simplest for a same-origin PWA                       |
| API-OQ-2 | Should owners be able to back-date payments?           | Owner only, logged (A-10)                                                                       |
| API-OQ-3 | Should a reprinted receipt be marked "duplicate copy"? | Yes                                                                                             |
| API-OQ-4 | Store PDFs, or regenerate on demand?                   | Regenerate from stored data; revisit if layout changes become a legal issue (accountant review) |
| API-OQ-5 | Allow a payment reversal when part of it was refunded? | Refuse and explain; refund must be reversed first                                               |
| API-OQ-6 | Super-admin support access to tenant data (OQ-10)      | None by default                                                                                 |
| API-OQ-7 | Suspended-tenant behaviour (OQ-11)                     | Sign in and export allowed; new entries refused with `TENANT_SUSPENDED`                         |
| API-OQ-8 | Idempotency key retention                              | 24 hours                                                                                        |
| API-OQ-9 | Import limits (file size and rows)                     | 5 MB, 5,000 rows                                                                                |
