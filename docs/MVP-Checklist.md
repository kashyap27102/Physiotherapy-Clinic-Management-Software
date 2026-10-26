# MVP Feature Checklist

|              |                                                                        |
| ------------ | ---------------------------------------------------------------------- |
| **Version**  | 1.0                                                                    |
| **Date**     | 2026-10-26                                                             |
| **Based on** | [PRD.md](PRD.md) v1.0 (scope approved), [ER-Diagram.md](ER-Diagram.md) |
| **Use**      | Tick items off as they are built and accepted. IDs match the PRD.      |

**Legend:** `Must` / `Should` = MoSCoW priority. **R1** = Pilot (about 2 months). **R2** = Full MVP (4 to 6 months from start). An item is done only when its acceptance criteria in [User-Stories.md](User-Stories.md) pass.

---

## Release 0 — Foundations (weeks 1 to 2)

- [x] Code repository, branching, and CI pipeline
- [x] React PWA shell: installable, responsive layout, "no connection" state (NFR-001, NFR-002)
- [x] Express service in TypeScript with layered structure: routes, services, data access (NFR-011)
- [x] Managed PostgreSQL on Render, **test data only** (NFR-012). Development database is on Neon for now; the production host is still open (OQ-5)
- [x] Migrations tool and the core schema skeleton from the ER document
- [x] Tenant-scoped data access layer and **automated tenant-isolation tests** (SEC-001)
- [x] Central permission-check middleware (SEC-006)
- [x] Centralised error format, request validation, and structured logging without patient data (NFR-010)
- [x] Email delivery service connected (INT-001). Resend adapter built; send a real test with `npm run email:test` in `server`
- [ ] Error monitoring connected (INT-005)
- [x] UI text kept in a strings file for future translation (NFR-003)

## Release 1 — Pilot

### Authentication and security

- [ ] **AUTH-001** Email and password login, lockout after repeated failures — Must
- [ ] **AUTH-002** Email OTP on new or unrecognised device — Must
- [ ] **AUTH-003** Trusted device list and revoke (own and, for owner, others) — Must
- [ ] **AUTH-004** Password reset by email link and password change — Must
- [ ] Session expiry after inactivity (BR-AUTH-2)
- [ ] Rate limiting on login, OTP, and reset endpoints (SEC-004)

### Clinics, branches, and staff

- [ ] **TEN-001** Minimal tenant creation by super-admin (clinic and first owner) — Must
- [ ] **TEN-001** Owner edits clinic profile: name, address, phone, logo, receipt details — Must
- [ ] **TEN-002** Branch create, edit, deactivate; branch code locked after first receipt — Must
- [ ] **USR-001** Staff create, edit, deactivate; one branch each — Must
- [ ] **USR-002** Owner edits permissions for Receptionist and Physiotherapist roles — Must
- [ ] Default permission templates created for every new tenant (BR-USR-7)
- [ ] Lock-out protection warning when removing key permissions

### Patients

- [ ] **PAT-001** Register patient: name, phone, age, gender mandatory — Must
- [ ] Possible-duplicate check by phone and similar name — Must
- [ ] **PAT-002** Search by name or phone, across all branches — Must
- [ ] **PAT-003** Patient profile with tabs: Overview, Treatment, Visits, Payments — Must
- [ ] Balance or advance credit shown prominently on the profile — Must
- [ ] **PAT-004** Edit patient details with before/after audit — Must
- [ ] **PAT-005** Cross-branch access with branch tags on visits and payments — Must

### Clinical

- [ ] **CLN-001** Start an episode; one active episode per patient — Must
- [ ] **CLN-002** Assessment form: history, pain, range of motion, diagnosis; versioned — Must
- [ ] **CLN-003** Treatment plan: diagnosis, goals, sessions and frequency, therapy types, estimated cost; versioned — Must
- [ ] Plan progress shown ("session 6 of 10") and notice when exceeded — Must
- [ ] **CLN-004** Discharge with optional note; dues prompt that does not block — Must
- [ ] Reactivate by starting a new episode, history preserved — Must

### Visits

- [ ] **VIS-001** Receptionist home: search box, "Register new patient" button, today's visits list — Must
- [ ] **VIS-001** Mark attendance; creates visit and charge; stores the fee at the time — Must
- [ ] Same-day duplicate attendance confirmation — Must
- [ ] **VIS-002** Optional session note, versioned — Must
- [ ] **VIS-003** Patient visit history across episodes and branches — Must

### Billing

- [ ] **BILL-001** Default session fee (owner) and fee override with reason — Must
- [ ] Fee change applies to future visits only — Must
- [ ] **BILL-002** Append-only ledger: charge, payment, refund, reversal — Must
- [ ] **BILL-003** Record payment: cash, UPI, card, bank transfer; advance allowed — Must
- [ ] **BILL-004** Refund of advance credit with permission, method, and reason — Must
- [ ] **BILL-005** Reverse an attendance or payment with reason; original stays visible — Must
- [ ] **BILL-006** Receipt per payment as PDF and print — Must
- [ ] Receipt numbers per branch per financial year; no duplicates, no gaps — Must
- [ ] Reversal receipt with its own number — Must
- [ ] **BILL-007** Invoice on request for an episode or period — Must
- [ ] **BILL-008** Dues warning on attendance and on opening a patient (all branches count) — Must

### Audit

- [ ] **AUD-001** Immutable audit log: views, edits, money events, permission changes, logins — Must
- [ ] Owner audit log viewer with filters — Must

### Dashboard

- [ ] **REP-001** Basic owner dashboard: patients seen, collections, dues — Should (first to move to R2 if the pilot slips)

### R1 exit gate

- [ ] A pilot clinic runs a full working day end to end
- [ ] Ledger balances reconcile with a manual count for the pilot period
- [ ] Tenant-isolation and permission tests pass in CI
- [ ] **Legal answer on data location obtained before any real patient data is stored** (OQ-5, REG-2)
- [ ] No open critical bugs

## Release 2 — Full MVP

### Reports and export

- [ ] **REP-002** Revenue: daily, weekly, monthly — Should
- [ ] **REP-002** Outstanding balances by patient — Should
- [ ] **REP-002** Visits and revenue by branch — Should
- [ ] **REP-002** Collections by payment method — Should
- [ ] **REP-003** Excel and PDF export of every report — Should
- [ ] **REP-001** Dashboard (if moved from R1) — Should

### Import and data export

- [ ] **IMP-001** Excel template download — Should
- [ ] **IMP-001** Upload, column mapping, validation, preview, row-level errors — Should
- [ ] **IMP-001** Duplicate handling and import result report — Should
- [ ] **IMP-001** Roll back an import batch — Should
- [ ] **EXP-001** Owner export of patients, visits, and payments to Excel — Should

### Platform

- [ ] **ADM-001** Super-admin console: tenant list, create, suspend, reactivate, usage — Should
- [ ] **SUB-001** Plans with limits and feature flags; trial and subscription status — Should
- [ ] Plan limits enforced with clear messages (branches, users, patients)
- [ ] Suspended-tenant behaviour (OQ-11) implemented as decided
- [ ] **INA-001** Inactive-patient flag and list (default 30 days, owner-configurable) — Should

### Quality, security, and launch readiness

- [ ] **Independent security review** completed and findings fixed (SEC-010) — Must
- [ ] Backup restore test performed from a real backup (NFR-007) — Must
- [ ] Performance check at expected scale (NFR-004, NFR-005)
- [ ] Accessibility basics checked (NFR-008, pending OQ-13)
- [ ] Production hosting and data location decided and set up (OQ-5)
- [ ] Privacy policy, terms of service, and clinic data-processing terms reviewed by a lawyer (REG-8)
- [ ] Receipt and invoice format reviewed by a chartered accountant (REG-4)
- [ ] Record retention and cancelled-tenant data handling decided (OQ-6)
- [ ] User guide or short onboarding walkthrough for clinics
- [ ] Support process defined (who answers clinics, how fast)

### R2 exit gate

- [ ] Security review passed, no open critical or high findings
- [ ] Restore test passed
- [ ] Legal and accountant items resolved or consciously accepted in writing
- [ ] Two or more clinics onboarded without developer help

## Explicitly NOT in the MVP

Do not build these now. They are recorded so they are not added by accident.

- [ ] ~~Appointment calendar, advance booking, therapist availability and leave, reminders~~
- [ ] ~~WhatsApp or SMS messaging~~
- [ ] ~~Patient document upload~~
- [ ] ~~Exercise library and home-exercise sharing~~
- [ ] ~~Progress tracking and charts; follow-up reminders~~
- [ ] ~~Expense tracking; therapist-wise reports~~
- [ ] ~~Accountant and branch-manager roles; custom roles; per-user permission overrides~~
- [ ] ~~Patient login or portal~~
- [ ] ~~Fixed named packages~~
- [ ] ~~GST tax invoices; insurance/TPA; cheque payments~~
- [ ] ~~Offline mode; native mobile apps; languages other than English~~
- [ ] ~~Online subscription payment collection~~
- [ ] ~~Online patient self-booking~~
- [ ] ~~Formal printable discharge summary; configurable assessment templates; SOAP notes~~

## Decisions to confirm before or during the build

| ID            | Decision                                                             | Needed before         |
| ------------- | -------------------------------------------------------------------- | --------------------- |
| OQ-1          | Estimated cost on the treatment plan is informational only           | CLN-003               |
| OQ-2          | Clinic details that must appear on receipts                          | BILL-006              |
| OQ-5          | Production host and data location                                    | Any real patient data |
| OQ-9          | Payments applied at account level or per visit (reports)             | REP-002               |
| OQ-10         | Super-admin access to tenant data                                    | ADM-001               |
| OQ-11         | Behaviour of a suspended tenant                                      | SUB-001               |
| OQ-14         | Who may correct back-dated or wrong-branch entries                   | BILL build            |
| DD-1 to DD-10 | Design decisions in the ER document, section 7                       | Schema design         |
| API decisions | Open items in [API-Requirements.md](API-Requirements.md), section 14 | API build             |
