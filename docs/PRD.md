# Physiotherapy Clinic Management Software — Product Requirements Document

|                  |                                                       |
| ---------------- | ----------------------------------------------------- |
| **Version**      | 1.0 (scope approved)                                  |
| **Date**         | 2026-10-26                                            |
| **Status**       | Scope approved by product owner; PRD ready for review |
| **Market**       | India                                                 |
| **Product type** | Multi-tenant SaaS (clinic business → branches)        |

## How to read this document

Every requirement carries a **Source** tag so confirmed decisions are never confused with suggestions:

| Tag     | Meaning                                                                                         |
| ------- | ----------------------------------------------------------------------------------------------- |
| **C**   | **Confirmed** by the product owner during discovery (decision reference in brackets, e.g. Q23). |
| **Rec** | **Recommendation** by the business analyst. Not yet confirmed; needs approval.                  |
| **A**   | **Assumption** made because information was missing. Listed in section 26.                      |

Priorities use MoSCoW (Must / Should / Could / Won't for the MVP). Releases are **R1** (Pilot, about 2 months) and **R2** (Full MVP, 4 to 6 months from start).

> **Legal disclaimer.** Nothing in this document is legal, tax, or regulatory advice. Items in section 19 are flags for review by qualified professionals (lawyer, chartered accountant). No compliance is claimed.

---

## 1. Executive Summary

This product is a cloud-based clinic management system for small physiotherapy clinics in India (2 to 5 therapists, 1 to 2 branches), many of which still run on paper or Excel. It is a **multi-tenant SaaS**: each clinic business is an isolated tenant that can have multiple branches, managed by a platform super-admin.

The MVP is built around how these clinics actually work: **walk-in patients, no advance appointment booking, and flexible payment timing** (some patients prepay for several days, others pay after several days). The core loop is:

1. Register a patient (name, phone, age, gender) in seconds.
2. A therapist records an assessment and a treatment plan.
3. On each visit, staff mark attendance; each attended session adds a charge to the patient's running account.
4. Payments, advances, refunds, and corrections are recorded in an append-only ledger.
5. The patient receives a numbered receipt; an invoice is available on request.
6. The therapist discharges the patient when treatment ends. The patient can return later under a new treatment episode.

Priorities, in order: **(1) patient records, (2) appointments and visits, (3) billing and payments**. Because walk-ins dominate, the MVP replaces the appointment calendar with a "today's visits" list.

Delivery is in two releases: a **Pilot (R1, about 2 months)** for one or two friendly clinics, then a **Full MVP (R2, 4 to 6 months)**. Technology: React PWA, Node.js with Express (TypeScript), PostgreSQL, hosted prototype-first on Render. Production hosting and data location are decided after legal review (section 19).

## 2. Product Vision

_Every small physiotherapy clinic in India can run its patients, visits, and money from one simple, fast, trustworthy system, without paper registers or Excel sheets._

Design principles:

- **Speed at the front desk.** The common actions (find patient, register, mark attendance, take payment) take seconds.
- **Money you can trust.** Nothing is deleted. Every balance is the sum of recorded entries and can be audited.
- **Privacy by default.** One clinic never sees another's data. Access to sensitive records is permission-controlled and logged.
- **Simple first, extensible later.** The data model leaves room for appointments, reminders, packages, and more roles.

## 3. Problem Statement

Small physiotherapy clinics in India typically keep patient history on paper or in spreadsheets. Per the product owner's priorities, the problems to solve are, in order:

1. **Messy records and hard-to-find patient history.** Past complaints, treatments, and visits are scattered.
2. **Hard-to-manage visits.** Staff cannot easily see who came today, which session number it is, or who treated them.
3. **Billing and dues not tracked properly.** Patients pay in advance or after several days, so dues and advances are easily lost.

Later-phase problems (not MVP): no structured view of patient improvement (progress tracking) and patients dropping out of treatment (follow-up reminders).

## 4. Business Objectives

| ID   | Objective                                     | Measure (proposed)                                             | Source               |
| ---- | --------------------------------------------- | -------------------------------------------------------------- | -------------------- |
| BO-1 | Validate the core workflow with real clinics  | 2 pilot clinics using it daily for at least 4 weeks            | Rec                  |
| BO-2 | Replace paper/Excel for patient records       | 100% of a pilot clinic's new patients registered in the system | Rec                  |
| BO-3 | Make dues and advances visible                | Zero unexplained ledger differences in pilot clinics           | Rec                  |
| BO-4 | Build a scalable multi-tenant SaaS foundation | New clinic onboarded without developer help (R2)               | C (multi-tenant, Q1) |
| BO-5 | Prepare for paid subscriptions                | Plans, limits, and trial status exist in the data model (R2)   | C (A-1)              |

## 5. Target Audience and User Personas

**Target customers (C, Q2):** small clinics with 2 to 5 therapists and 1 to 2 branches. Hospitals, large rehab centres, and chains are not targets.

The personas below are illustrative and for design discussion only.

| Persona                                                    | Role in system  | Goals                                                                           | Pain points today                                             |
| ---------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **Clinic owner** (often also a practising physiotherapist) | Owner/Admin     | Know daily collections and dues; control who sees what; keep records safe       | Cash and dues tracked in a notebook; cannot see both branches |
| **Receptionist**                                           | Receptionist    | Register walk-ins fast; mark attendance; take payments; find returning patients | Searching paper files; remembering who owes money             |
| **Physiotherapist**                                        | Physiotherapist | Record assessment and plan quickly; see patient history before treating         | Handwritten notes; no history at hand                         |
| **Platform super-admin** (the product owner)               | Super-admin     | Onboard clinics; manage plans and status; support clinics                       | No tooling yet                                                |

**Patients do not log in (C, Q5).** They receive printed or PDF receipts only.

## 6. Stakeholders

| Stakeholder                                   | Interest                                                     |
| --------------------------------------------- | ------------------------------------------------------------ |
| Product owner / platform operator             | Product success; builds with AI coding tools; final approver |
| Clinic owners                                 | Accurate collections, control, data safety                   |
| Receptionists and therapists                  | Speed and ease of use                                        |
| Patients (indirect)                           | Privacy of health data; correct billing                      |
| Legal counsel (to be engaged)                 | Data location, retention, consent, health-data rules         |
| Chartered accountant (to be engaged)          | Receipt/invoice numbering, GST treatment                     |
| Independent security reviewer (to be engaged) | Pre-launch review of tenant isolation, permissions, ledger   |
| Third-party vendors                           | Hosting (Render at prototype stage), email delivery          |

## 7. Product Scope

### In scope for the MVP (R1 + R2)

- Multi-tenant platform with clinics (tenants), branches, staff accounts, and a super-admin.
- Login with email and password; email OTP on new devices; trusted-device management.
- Owner-managed permissions per role (Owner/Admin, Receptionist, Physiotherapist).
- Patient registration, search, and profile; one patient record shared across branches.
- Treatment episodes: assessment (fixed form), treatment plan, discharge.
- Today's visits, attendance marking, optional session notes.
- Running patient account (ledger): default session fee with override, payments, advances, refunds, reversals.
- Receipts per payment and invoices on request (PDF/print), numbered per branch per financial year.
- Dues warning on visits.
- Owner dashboard and reports with Excel/PDF export (R2).
- Excel import of existing patient lists (R2).
- Owner export of clinic data to Excel (R2).
- Audit log.
- Subscription groundwork: plans, limits, feature flags, trial status (R2).
- Responsive PWA; English only; online only.

### Explicitly out of scope for the MVP (Won't Have)

Appointment calendar and advance booking; therapist availability and leave; reminders; WhatsApp/SMS messaging; patient document upload (X-rays, MRI, prescriptions); exercise library and home-exercise sharing; progress tracking and charts; follow-up reminders for dropped-out patients; expense tracking; therapist-wise reports; accountant and branch-manager roles; patient portal/login; custom roles and per-user permission overrides; fixed named packages; GST tax invoices; insurance/TPA claims; cheque payments; offline mode; native mobile apps; languages other than English; online subscription payment collection; online patient self-booking; formal printable discharge summary; configurable assessment templates; structured SOAP notes.

## 8. MVP vs Future Phases (MoSCoW)

| Feature                                                                        | Priority          | Release                                              |
| ------------------------------------------------------------------------------ | ----------------- | ---------------------------------------------------- |
| Authentication, email OTP on new device, trusted devices                       | Must              | R1                                                   |
| Clinics, branches, staff accounts                                              | Must              | R1                                                   |
| Owner-managed role permissions                                                 | Must              | R1                                                   |
| Patient registration, search, profile (shared across branches)                 | Must              | R1                                                   |
| Episodes: assessment, treatment plan, discharge                                | Must              | R1                                                   |
| Today's visits, attendance, optional notes                                     | Must              | R1                                                   |
| Ledger: fees, payments, advances, refunds, reversals                           | Must              | R1                                                   |
| Receipts and invoices, numbering                                               | Must              | R1                                                   |
| Dues warning                                                                   | Must              | R1                                                   |
| Audit log                                                                      | Must              | R1                                                   |
| Basic owner dashboard (today's summary, dues)                                  | Should            | R1 (first to move to R2 if the pilot slips)          |
| Excel import of patients                                                       | Should            | R2                                                   |
| Full reports and Excel/PDF export                                              | Should            | R2                                                   |
| Owner data export                                                              | Should            | R2                                                   |
| Super-admin console                                                            | Should            | R2 (a minimal way to create tenants is needed in R1) |
| Subscription groundwork (plans, limits, trial status)                          | Should            | R2                                                   |
| Inactive-patient flag                                                          | Should            | R2                                                   |
| Security review, tenant-isolation testing, restore test                        | Must (pre-launch) | R2                                                   |
| Patient documents, WhatsApp/SMS, exercise sharing                              | Could             | Later                                                |
| Appointment calendar and booking, reminders                                    | Could             | Later                                                |
| Progress tracking, follow-up reminders, expenses                               | Could             | Later                                                |
| Native apps, offline, other languages, patient portal, GST invoices, insurance | Won't (MVP)       | Later / TBD                                          |

> **Note (R-12).** The Pilot is tight for 2 months. If it slips, move the basic dashboard to R2 first.

---

## 9. Functional Requirements

Requirement ID prefixes: **AUTH** authentication, **TEN** clinics and branches, **USR** staff and permissions, **PAT** patients, **CLN** clinical (episodes), **VIS** visits, **BILL** billing, **REP** reports, **IMP** import, **EXP** export, **ADM** super-admin, **SUB** subscription groundwork, **AUD** audit, **NFR** non-functional.

Detail template for each major requirement: ID, name, description, user role, priority, preconditions, expected behavior, business rules, validation, edge cases, acceptance criteria (section 11), dependencies.

### 9.1 Authentication (AUTH)

#### AUTH-001 — Email and password login

- **Description:** Users sign in with email and password. **Source:** C (Q41).
- **Role:** All users. **Priority:** Must. **Release:** R1.
- **Preconditions:** User account exists, is active, and belongs to an active tenant (or is a super-admin).
- **Expected behavior:** Valid credentials start a session. Invalid credentials show a generic error that does not reveal whether the email exists.
- **Business rules:** BR-AUTH-1: repeated failed logins temporarily lock the account (Rec: 5 failures, 15-minute lock). BR-AUTH-2: sessions expire after inactivity (Rec: 30 minutes for staff; value configurable by platform).
- **Validation:** Email format; password policy (Rec: minimum 10 characters, checked against common-password list).
- **Edge cases:** Disabled user; suspended tenant; user removed while logged in (session invalidated); password reset flow (email link, single use, short expiry).
- **Dependencies:** Email delivery service.

#### AUTH-002 — Email OTP on new or unrecognised device

- **Description:** After a correct password, if the device is not trusted, the user must enter a one-time code sent to their email. **Source:** C (Q41, option C).
- **Role:** All users. **Priority:** Must. **Release:** R1.
- **Expected behavior:** A 6-digit code is emailed; the user enters it; the user may choose "trust this device".
- **Business rules:** Code expires in 10 minutes (Rec); limited attempts (Rec: 5); resend limited by rate (Rec). Trusted-device status lasts a configured period (Rec: 30 days).
- **Edge cases:** Email delayed; code reused; user changes email; clock skew.
- **Dependencies:** AUTH-001, email delivery.

#### AUTH-003 — Trusted device management

- **Description:** Users can see and revoke their trusted devices; the Owner can revoke a device for any user in the clinic. **Source:** Rec (derived from Q41).
- **Priority:** Must. **Release:** R1.
- **Acceptance:** Revoking a device forces OTP on its next login.

#### AUTH-004 — Password reset and change

- **Description:** Self-service reset by email link; change password when logged in. **Source:** Rec. **Priority:** Must. **Release:** R1.

### 9.2 Clinics, branches, and tenancy (TEN)

#### TEN-001 — Clinic (tenant) creation

- **Description:** A clinic registers itself: the future Owner enters clinic name, their name, work email, mobile number and password, accepts the terms, and confirms the email with a 6-digit code. Only then are the clinic, a 14-day trial subscription, the three roles with default permissions (BR-USR-7) and the Owner account created, and the Owner is signed in. On first sign-in the Owner must add the first branch before using the app. The Owner later sets the clinic profile (name, address, phone, logo, registration details printed on receipts). **Source:** C (Q1, A-4 for receipt details); self-registration decided 2026-10-27, replacing creation by the super-admin.
- **Role:** Anyone (register); Owner (edit profile). **Priority:** Must. **Release:** R1. Super-admin console stays R2 (ADM-001).
- **Business rules:** BR-TEN-1: every record belongs to exactly one tenant and is never visible to another tenant. BR-TEN-3: a clinic is usable as soon as its email is verified (no manual approval); the trial lasts 14 days, and what happens at its end is decided with SUB-001 / OQ-11.
- **Edge cases:** Email that already has an account (the form answers the same; that person is emailed "you already have an account"); abandoned sign-ups (nothing is created before the code); tenant suspended mid-session.
- **Risk:** Open sign-up means real clinics can enter real patient data before the legal review on data location (REG-2) is done. Accepted for now; revisit before public launch.
- **Dependencies:** AUTH.

#### TEN-002 — Branch management

- **Description:** Owner creates and edits branches (name, address, phone, branch code used in receipt numbers). **Source:** C (Q1, Q50).
- **Role:** Owner. **Priority:** Must. **Release:** R1.
- **Business rules:** BR-TEN-2: branch code unique within the tenant, not editable after the first receipt is issued. BR-TEN-3: branches cannot be deleted once they hold visits or payments; they can be deactivated (Rec).
- **Edge cases:** Plan limit on branches (SUB-001); deactivating a branch with active staff.

### 9.3 Staff, roles, and permissions (USR)

#### USR-001 — Staff account management

- **Description:** Owner creates, edits, deactivates staff users (Receptionist, Physiotherapist) and assigns **one branch each**. **Source:** C (Q24).
- **Role:** Owner. **Priority:** Must. **Release:** R1.
- **Business rules:** BR-USR-1: a Receptionist or Physiotherapist belongs to exactly one branch; the Owner sees all branches. BR-USR-2: users are deactivated, never deleted, so history stays attributable. BR-USR-3: moving a staff member to another branch is a reassignment by the Owner.
- **Edge cases:** Deactivating the last Owner is blocked; plan limit on users.

#### USR-002 — Owner-managed role permissions

- **Description:** The Owner edits which permissions each role (Receptionist, Physiotherapist) holds. All users in a role share the same permissions. **Source:** C (Q7 revised, Q8 option A).
- **Role:** Owner. **Priority:** Must. **Release:** R1.
- **Business rules:** BR-USR-4: Owner/Admin always has all permissions within its tenant and this cannot be reduced. BR-USR-5: no per-user overrides and no custom roles in the MVP, but the permission model must allow custom roles later. BR-USR-6: every permission change is audit-logged. BR-USR-7: each new tenant starts with default permission templates (section 16).
- **Edge cases:** Owner removes a permission while a user is mid-task (takes effect on next request); lock-out protection warns before removing permissions that would leave nobody able to take payments (Rec).
- **Dependencies:** AUD-001.

### 9.4 Patients (PAT)

#### PAT-001 — Patient registration

- **Description:** Register a patient quickly. **Mandatory fields: name, phone, age, gender.** All other fields optional. **Source:** C (Q9, Q10).
- **Role:** Receptionist (default), Owner. **Priority:** Must. **Release:** R1.
- **Preconditions:** User holds "register patient" permission.
- **Expected behavior:** After saving, the user can go straight to starting an episode and/or marking today's attendance.
- **Business rules:** BR-PAT-1: a patient belongs to the tenant, not to a branch; the registering branch is recorded. BR-PAT-2: possible duplicates (same phone, similar name) are shown before saving, and the user may still create a new record, because family members often share a phone number (Rec). BR-PAT-3: age and date of birth are interchangeable; the form accepts either and derives the other (Rec, noted at Q10).
- **Validation:** Name non-empty; phone 10-digit Indian mobile (+91 optional) or other valid number; age 0 to 120 or valid date of birth; gender from a fixed list (Male, Female, Other, Prefer not to say).
- **Optional fields (Rec):** address, emergency contact, occupation, referring doctor, email, notes.
- **Edge cases:** Patient without a personal phone (guardian's number); patient name spelled differently; minors.

#### PAT-002 — Patient search

- **Description:** Search by name or phone from the home screen. **Source:** C (Q33), A-2.
- **Role:** Receptionist, Therapist, Owner. **Priority:** Must. **Release:** R1.
- **Business rules:** BR-PAT-4: search covers all patients in the tenant, across branches (C, Q28). BR-PAT-5: results show name, phone, age, last visit date, branch of last visit, and a dues indicator.
- **Edge cases:** Partial phone number; mixed case; very many results (paged).

#### PAT-003 — Patient profile

- **Description:** A single page with tabs: Overview, Treatment, Visits, Payments. Shows basic details and discharge status; outstanding balance or advance credit prominently at the top; assessment and treatment plan; visit history with notes; payment and receipt history; branch tags on visits and payments; quick actions (mark attendance, record payment, discharge). **Source:** C (Q34 items A to G); tabs are Rec.
- **Priority:** Must. **Release:** R1.
- **Business rules:** Sections visible depend on the viewer's permissions (for example clinical notes read-only for a receptionist).

#### PAT-004 — Edit patient details

- **Description:** Authorised users edit patient details; changes are audit-logged with before/after values. **Source:** Rec. **Priority:** Must. **Release:** R1.

#### PAT-005 — Cross-branch access

- **Description:** Staff at any branch can search and open any patient in the tenant, including visits and payments at other branches, subject to role permissions. **Source:** C (Q23, Q28).
- **Priority:** Must. **Release:** R1.
- **Business rules:** Each view of a patient record is logged (AUD-001).

### 9.5 Clinical: episodes, assessment, plan, discharge (CLN)

#### CLN-001 — Treatment episodes

- **Description:** A patient can have many episodes; each is one course of treatment with its own assessment, plan, visits, and discharge. All episodes sit under one patient; the payment ledger stays at patient level. **Source:** C (Q48).
- **Role:** Physiotherapist, Owner. **Priority:** Must. **Release:** R1.
- **Business rules:** BR-CLN-1: attendance belongs to an episode. BR-CLN-2: a patient may have at most one active episode at a time (Rec). BR-CLN-3: reactivation means starting a new episode; the old history is preserved.
- **Edge cases:** A visit for a patient with no active episode prompts the user to start one first; a walk-in whose therapist has not yet assessed them can be marked present and the episode opened immediately (Rec).

#### CLN-002 — Initial assessment (fixed form)

- **Description:** The therapist records: **history, pain, range of motion, diagnosis** (C, Q11). The MVP uses one fixed form (A-3). **Source:** C for the four sections; additional fields below are Rec.
- **Recommended fields:** chief complaint, onset and duration, pain site, pain score 0 to 10 at rest and in movement, aggravating and relieving factors, past medical and surgical history, range of motion by joint (free text or simple table), notes.
- **Role:** Physiotherapist (default), Owner. **Priority:** Must. **Release:** R1.
- **Business rules:** BR-CLN-4: assessments are append-only versions; edits create a new version and keep the old (Rec, consistent with "nothing is deleted", Q25).

#### CLN-003 — Treatment plan

- **Description:** Contains diagnosis or condition, treatment goals, **planned number of sessions and frequency**, **types of therapy**, and **estimated cost**. **Source:** C (Q12).
- **Priority:** Must. **Release:** R1.
- **Business rules:** BR-CLN-5: the estimated cost is **informational only**. Billing is per visit through the ledger because fixed packages are out of scope (Q18). This resolves OQ-1 (inferred from Q18; please confirm). BR-CLN-6: planned sessions are a guide, not a limit; the UI shows progress ("session 6 of 10") and a gentle notice when the plan is exceeded (Rec, A).
- **Edge cases:** Plan changed mid-treatment (new version kept); free-text exercise notes are allowed in the plan notes field (Rec; exercise library is out of scope).

#### CLN-004 — Discharge

- **Description:** The therapist marks the episode and patient as discharged, with an optional note. Discharged patients move to an inactive list. **Source:** C (Q21 option A).
- **Priority:** Must. **Release:** R1.
- **Business rules:** BR-CLN-7: discharge with an outstanding balance shows a prompt to settle or record the due; it does not block (Rec, consistent with Q27). BR-CLN-8: a discharged patient is reactivated by starting a new episode (C, Q48). BR-CLN-9: only users holding the "discharge patient" permission may discharge (Rec, since permissions are owner-managed).
- **Out of scope:** formal printable discharge summary.

### 9.6 Visits and attendance (VIS)

#### VIS-001 — Today's visits and attendance

- **Description:** Because follow-ups are not pre-booked, the patient simply arrives and staff mark attendance on that day. The home screen shows a list of today's visits and a quick action to mark a patient present. **Source:** C (Q14, Q15 option A, Q33).
- **Role:** Receptionist and/or Physiotherapist, as configured by the Owner. **Priority:** Must. **Release:** R1.
- **Expected behavior:** Selecting a patient and "Mark attendance" creates a visit in the user's branch, linked to the active episode, with the treating therapist (optional field, defaults to the marking user if a therapist), the session fee, and the date and time. The fee becomes a **charge** in the ledger (BILL-002).
- **Business rules:** BR-VIS-1: marking attendance counts one session against the episode. BR-VIS-2: the session fee is the default fee, or an override with a recorded reason (BILL-001). BR-VIS-3: the fee in force at the time is stored on the visit (C, Q49). BR-VIS-4: if the patient has an outstanding balance, a visible warning shows the amount due; the visit is allowed (C, Q27). BR-VIS-5: duplicate attendance for the same patient and day shows a confirmation before a second visit is created (Rec), since some clinics treat twice a day.
- **Edge cases:** Wrong patient marked (see reversal, BILL-005); attendance after midnight; visit marked at the wrong branch.

#### VIS-002 — Session note (optional)

- **Description:** A short free-text note per visit (what was done, patient response, pain level). **Source:** C (Q13 option D).
- **Role:** Physiotherapist. **Priority:** Must (the field), optional to fill. **Release:** R1.
- **Business rules:** Notes are append-only; corrections add a new version.

#### VIS-003 — Patient visit history

- **Description:** A chronological list of visits across episodes and branches. **Source:** C (Q15 option A). **Priority:** Must. **Release:** R1.

### 9.7 Billing and payments (BILL)

The patient has a **running account**. Each attended session adds a charge. Payments are recorded whenever they happen: in advance (creating credit) or later (clearing dues). The system does not enforce payment timing. **Source:** C (Q16 clarification, Q18 option A).

#### BILL-001 — Session fee and overrides

- **Description:** The Owner sets a default session fee for the tenant. Authorised staff can override it for a patient or a single visit; every override records the amount and a reason. **Source:** C (Q19 option D).
- **Priority:** Must. **Release:** R1.
- **Business rules:** BR-BILL-1: a fee change applies to future visits only; past visits keep their stored fee (C, Q49). BR-BILL-2: "can override fee" is a role permission. BR-BILL-3: a patient-level fee, if set, applies to that patient's future visits until changed (Rec).
- **Validation:** Fee is a non-negative amount in INR with two decimals; zero-fee visits require a reason (Rec).

#### BILL-002 — Patient ledger

- **Description:** An append-only ledger of entries per patient: **CHARGE** (from a visit), **PAYMENT**, **REFUND**, **REVERSAL** (of a prior entry). Balance = charges − payments + refunds, adjusted by reversals. Negative balance = advance credit; positive = dues. **Source:** C (Q16, Q25, Q26); entry types are Rec.
- **Priority:** Must. **Release:** R1.
- **Business rules:** BR-BILL-4: entries are never edited or deleted. BR-BILL-5: each entry stores branch, user, timestamp, and (for reversals) the original entry and a reason. BR-BILL-6: the balance is computed from entries, not stored independently, or stored only as a verified cache (Rec). BR-BILL-7: payments are applied to the patient's account as a whole, not matched to specific visits (A; see OQ-9).
- **Edge cases:** Concurrent entries by two users; patient balance crossing episodes (balance carries across episodes, per Q48).

#### BILL-003 — Record a payment

- **Description:** Record amount, method (**cash, UPI, debit/credit card, bank transfer**), date, branch, and optional reference (for example a UPI transaction ID). The system only **records** the payment; it does not process online payments. **Source:** C (Q17).
- **Priority:** Must. **Release:** R1.
- **Business rules:** BR-BILL-8: the payment may exceed current dues, creating advance credit (C, Q16). BR-BILL-9: each payment produces a receipt (BILL-006).
- **Validation:** Amount greater than zero; method required; reference required for bank transfer (Rec).
- **Out of scope:** cheque, insurance/TPA.

#### BILL-004 — Refunds and advance credit

- **Description:** Unused advance may be refunded or kept as credit, decided case by case. **Source:** C (Q26 option C).
- **Priority:** Must. **Release:** R1.
- **Business rules:** BR-BILL-10: refunding requires a "process refund" permission assigned by the Owner. BR-BILL-11: a refund records amount, method, reason, and the user. BR-BILL-12: a refund cannot exceed the patient's advance credit (Rec).

#### BILL-005 — Corrections by reversal

- **Description:** A wrongly entered attendance or payment is corrected by a **reversal entry**, not by editing or deleting. The original stays visible, linked to its reversal, with the reason, user, and time. **Source:** C (Q25 option C, same-day included).
- **Priority:** Must. **Release:** R1.
- **Business rules:** BR-BILL-13: reversing a visit's attendance also reverses its charge and decrements the episode's session count. BR-BILL-14: reversing a payment reverses its receipt (a reversal receipt number is issued). BR-BILL-15: an entry can be reversed once; correcting an amount means reversing then re-entering. BR-BILL-16: reversing requires the "reverse entry" permission (Rec).
- **Edge cases:** Reversing a payment that has been partially refunded.

#### BILL-006 — Receipts and numbering

- **Description:** Every payment generates a receipt showing clinic details, patient, amount, date, method, branch, receipt number, and balance after payment. Output is PDF and printable. **Source:** C (Q20 option D, Q50 option C).
- **Priority:** Must. **Release:** R1.
- **Business rules:** BR-BILL-17: numbers are sequential **per branch per financial year (April to March)**, for example `MUM/2026-27/0001`. BR-BILL-18: numbers are never reused, and gaps are not created by failed saves (allocate the number inside the same database transaction as the entry). BR-BILL-19: a reversal gets its own number. BR-BILL-20: the format and its legal adequacy need a chartered accountant's review (section 19).
- **Edge cases:** Concurrent receipts at one branch; financial year rollover at midnight on 1 April; branch code change (blocked after first receipt).
- **Out of scope:** automatic WhatsApp sharing; GST tax invoices.

#### BILL-007 — Invoice on request

- **Description:** A detailed invoice listing sessions, fees, discounts, and totals for a chosen period or episode, generated on request as PDF. **Source:** C (Q20 option D).
- **Priority:** Must. **Release:** R1.
- **Business rules:** Invoice numbers follow the same per-branch, per-financial-year sequence with an `INV` prefix (Rec). Invoices are not GST tax invoices.

#### BILL-008 — Dues warning

- **Description:** When marking attendance, or opening a patient with an outstanding balance, show a visible warning with the amount due. Do not block. **Source:** C (Q27 option B).
- **Priority:** Must. **Release:** R1.
- **Business rules:** Dues from **all branches** of the tenant count (Q28, Q23). Configurable thresholds are a later phase.

### 9.8 Reports and dashboard (REP)

#### REP-001 — Basic owner dashboard

- **Description:** Today's summary: patients seen, collections, outstanding dues. **Source:** C (Q22 item A). **Priority:** Should. **Release:** R1 (moves to R2 if the pilot slips).

#### REP-002 — Reports

- **Description:** Daily, weekly, monthly revenue; outstanding balances by patient; revenue and visits by branch; collections by payment method. **Source:** C (Q22). **Priority:** Should. **Release:** R2.
- **Business rules:** BR-REP-1: "collections" are payments received (cash basis) and "charges" are sessions delivered; reports state which they show (Rec). Reversals and refunds are netted and shown separately.
- **Out of scope:** therapist-wise reports, expense/profit reports, new-versus-returning analysis.

#### REP-003 — Report export

- **Description:** Export any report to Excel or PDF. **Source:** C (Q22 item I). **Priority:** Should. **Release:** R2.

### 9.9 Import and export (IMP, EXP)

#### IMP-001 — Excel import of patients

- **Description:** Import an existing patient list from Excel. **Source:** C (Q29 item G). **Priority:** Should. **Release:** R2.
- **Proposed behavior (Rec, OQ-4 open):** download a template; upload; map columns; validate (mandatory fields: name, phone, age, gender); preview with errors; duplicate detection by phone plus name; import with a result report; imports are logged and can be rolled back as a batch. Opening balances may be imported as a dated opening-balance ledger entry. Dues and visit history import is **not** assumed.
- **Edge cases:** Mixed date formats; missing gender; thousands of rows; duplicate rows; files from older Excel versions; non-English characters.

#### EXP-001 — Owner data export

- **Description:** The Owner can download the clinic's data (patients, visits, payments) to Excel at any time. **Source:** C (Q42 option B). **Priority:** Should. **Release:** R2.
- **Business rules:** Exports are audit-logged and require an Owner-level permission.

### 9.10 Super-admin and subscriptions (ADM, SUB)

#### ADM-001 — Super-admin console

- **Description:** The platform operator lists, creates, suspends, and reactivates tenants; views tenant plan, status, and usage counts; resets an owner's access. **Source:** C (Q5 role G). **Priority:** Should. **Release:** R2 (minimal tenant creation in R1).
- **Business rules (Rec, OQ-10):** by default the super-admin cannot view patient clinical or financial records; support access, if ever needed, is time-limited, tenant-approved, and logged.

#### SUB-001 — Subscription groundwork

- **Description:** Each tenant has a plan and a subscription status (trial, active, suspended, cancelled). Plans define limits (branches, users, patients) and feature flags, changeable without code changes. **Source:** C (A-1, Q4 deferral). **Priority:** Should. **Release:** R2.
- **Business rules:** Limits are enforced with clear messages. Behaviour of a suspended tenant is OQ-11 (Rec: read-only login and data export allowed, new entries blocked).
- **Out of scope:** pricing values, payment collection, subscription invoicing.

### 9.11 Audit (AUD)

#### AUD-001 — Audit log

- **Description:** An immutable log of who did what and when. **Source:** C (R-1, Q25) plus Rec for the event list.
- **Priority:** Must. **Release:** R1.
- **Events:** login, failed login, OTP, device trust/revoke, **patient record views**, patient edits, assessment/plan/note versions, attendance, payments, refunds, reversals, fee overrides, discharge, permission changes, staff changes, imports, exports.
- **Business rules:** Entries cannot be edited or deleted by any tenant user. The Owner can view and filter the tenant's log. Retention is OQ-6.

#### INA-001 — Inactive-patient flag

- **Description:** Flag patients with an active episode who have not visited for N days (default 30; Owner-configurable). **Source:** C (Q21). **Priority:** Should. **Release:** R2. Reminders to the patient are a later phase.

---

## 10. User Stories

| ID    | As a…        | I want to…                                                    | So that…                                         | Req              | Rel |
| ----- | ------------ | ------------------------------------------------------------- | ------------------------------------------------ | ---------------- | --- |
| US-01 | User         | sign in with email and password                               | I can access my clinic's data                    | AUTH-001         | R1  |
| US-02 | User         | enter a code emailed to me on a new device                    | my account stays safe                            | AUTH-002         | R1  |
| US-03 | Owner        | review and revoke trusted devices                             | a lost device cannot be used                     | AUTH-003         | R1  |
| US-04 | Super-admin  | create a clinic and its owner                                 | a clinic can start using the system              | TEN-001          | R1  |
| US-05 | Owner        | add branches                                                  | each location's work and receipts are separate   | TEN-002          | R1  |
| US-06 | Owner        | add staff and assign each to a branch                         | the right people work in the right place         | USR-001          | R1  |
| US-07 | Owner        | change what each role can do                                  | I control access to sensitive data and money     | USR-002          | R1  |
| US-08 | Receptionist | register a walk-in with name, phone, age, gender              | the patient is in the system in seconds          | PAT-001          | R1  |
| US-09 | Receptionist | search by name or phone                                       | I find returning patients and avoid duplicates   | PAT-002          | R1  |
| US-10 | Staff        | open a full patient profile                                   | I see history, balance, and actions in one place | PAT-003          | R1  |
| US-11 | Receptionist | find a patient registered at another branch                   | the patient does not re-register                 | PAT-005          | R1  |
| US-12 | Therapist    | record an assessment                                          | the patient's condition is documented            | CLN-002          | R1  |
| US-13 | Therapist    | write a treatment plan with sessions, therapies, and estimate | everyone knows the course of treatment           | CLN-003          | R1  |
| US-14 | Receptionist | mark attendance for today's visit                             | the session is counted and charged               | VIS-001          | R1  |
| US-15 | Therapist    | add a short note to a visit                                   | I remember what was done                         | VIS-002          | R1  |
| US-16 | Receptionist | see a warning when a patient owes money                       | I can ask for payment politely                   | BILL-008         | R1  |
| US-17 | Receptionist | record a payment by cash, UPI, card, or bank transfer         | the patient's balance is correct                 | BILL-003         | R1  |
| US-18 | Receptionist | accept an advance for several sessions                        | the patient's credit is tracked                  | BILL-002/003     | R1  |
| US-19 | Owner        | override the fee with a reason                                | I can give discounts with a record               | BILL-001         | R1  |
| US-20 | Owner        | refund unused advance or keep it as credit                    | I can handle stopped treatment fairly            | BILL-004         | R1  |
| US-21 | Staff        | reverse a wrong entry with a reason                           | mistakes are fixed without losing the trail      | BILL-005         | R1  |
| US-22 | Receptionist | print or save a numbered receipt                              | the patient has proof of payment                 | BILL-006         | R1  |
| US-23 | Receptionist | generate an invoice on request                                | a patient can claim from an employer or insurer  | BILL-007         | R1  |
| US-24 | Therapist    | discharge a patient                                           | finished cases leave the active list             | CLN-004          | R1  |
| US-25 | Therapist    | start a new episode for a returning patient                   | each course of treatment stays separate          | CLN-001          | R1  |
| US-26 | Owner        | see today's patients, collections, and dues                   | I know how the day is going                      | REP-001          | R1  |
| US-27 | Owner        | see revenue by day, week, month, and branch                   | I understand my business                         | REP-002          | R2  |
| US-28 | Owner        | export reports to Excel/PDF                                   | I can share them with my accountant              | REP-003          | R2  |
| US-29 | Owner        | import my Excel patient list                                  | I move off spreadsheets quickly                  | IMP-001          | R2  |
| US-30 | Owner        | download all my clinic's data                                 | I own my data and can back it up                 | EXP-001          | R2  |
| US-31 | Owner        | view who accessed which patient record                        | I can check misuse                               | AUD-001          | R1  |
| US-32 | Owner        | see patients who stopped coming                               | I can follow up by phone                         | INA-001          | R2  |
| US-33 | Super-admin  | suspend or reactivate a clinic and view its plan              | I can manage the platform                        | ADM-001, SUB-001 | R2  |

## 11. Acceptance Criteria (Given / When / Then)

**AUTH-001**

- _Given_ a valid active user, _when_ they submit the correct email and password on a trusted device, _then_ a session starts and they land on their home screen.
- _Given_ a wrong password, _when_ submitted, _then_ a generic error appears and the failure is counted.
- _Given_ five consecutive failures, _when_ a sixth attempt is made within the lock period, _then_ login is refused with a "try again later" message even if the password is correct.

**AUTH-002**

- _Given_ correct credentials on an unrecognised device, _when_ the user submits, _then_ a code is emailed and the app asks for it before opening a session.
- _Given_ an expired or wrong code, _when_ entered, _then_ access is refused, and after the attempt limit a new code must be requested.
- _Given_ the user ticks "trust this device", _when_ they log in again on it within the trust period, _then_ no code is asked.

**AUTH-003**

- _Given_ an Owner revokes a staff member's trusted device, _when_ that staff logs in from it, _then_ an OTP is required.

**TEN-001 / TEN-002**

- _Given_ a super-admin creates a tenant with an Owner email, _when_ the Owner accepts the invitation, _then_ they can set a password and see an empty clinic.
- _Given_ two tenants, _when_ a user from tenant A requests any record id from tenant B, _then_ the system returns "not found".
- _Given_ a branch has issued a receipt, _when_ the Owner tries to change its code, _then_ the change is refused.

**USR-001 / USR-002**

- _Given_ an Owner removes "view clinical notes" from the Receptionist role, _when_ a receptionist next opens a patient, _then_ the clinical sections are hidden.
- _Given_ a receptionist assigned to branch X, _when_ they mark attendance, _then_ the visit is recorded at branch X and they cannot choose another branch.
- _Given_ the Owner is the only Owner, _when_ they try to deactivate themselves, _then_ the action is blocked.

**PAT-001**

- _Given_ name, phone, age, and gender are filled, _when_ the receptionist saves, _then_ the patient is created with a unique ID and the registering branch.
- _Given_ any mandatory field is empty, _when_ saving, _then_ the form shows which field is missing and does not save.
- _Given_ an existing patient has the same phone, _when_ saving a new patient, _then_ the possible duplicate is shown and the user can choose "open existing" or "create anyway".

**PAT-002 / PAT-005**

- _Given_ a patient was registered at branch A, _when_ a receptionist at branch B searches the phone number, _then_ the patient appears with last-visit branch and dues indicator.
- _Given_ a staff member opens a patient, _then_ an audit entry records the user, patient, and time.

**CLN-001 to CLN-004**

- _Given_ a patient with no active episode, _when_ the user marks attendance, _then_ the app asks to start an episode first.
- _Given_ an assessment is saved, _when_ it is edited later, _then_ a new version is created and the earlier version stays viewable.
- _Given_ a plan of 10 sessions, _when_ the 11th attendance is marked, _then_ a notice says the plan is exceeded and the visit is still allowed.
- _Given_ a patient is discharged with dues, _when_ the therapist confirms, _then_ a prompt shows the balance and the discharge still completes.
- _Given_ a discharged patient returns, _when_ a new episode is started, _then_ old episodes remain and the ledger balance carries over.

**VIS-001 / VIS-002**

- _Given_ a patient with a default fee of ₹500, _when_ attendance is marked, _then_ a visit is created with fee ₹500 and a charge of ₹500 appears in the ledger.
- _Given_ the Owner later changes the default to ₹600, _then_ previously recorded visits still show ₹500.
- _Given_ a patient owes ₹1,500, _when_ attendance is marked, _then_ a visible warning shows ₹1,500 and the visit is allowed.
- _Given_ a visit exists, _when_ the therapist adds a note, _then_ it is saved with author and time.

**BILL-001**

- _Given_ a user without the override permission, _when_ they open the fee field on a visit, _then_ it is read-only.
- _Given_ a user with the permission enters a different fee, _when_ saving, _then_ a reason is required and both the fee and reason are stored.

**BILL-002 / BILL-003**

- _Given_ a patient with 3 charges of ₹500 and no payments, _when_ viewing the profile, _then_ the balance shows ₹1,500 due.
- _Given_ the patient pays ₹2,500 by UPI, _when_ saved, _then_ the balance shows ₹1,000 advance credit and a receipt is generated.
- _Given_ amount zero or negative, _when_ saving, _then_ the payment is rejected.

**BILL-004**

- _Given_ a patient has ₹1,000 advance credit, _when_ an authorised user refunds ₹1,000 with a reason, _then_ a refund entry is added and credit becomes zero.
- _Given_ a refund larger than the credit, _when_ submitted, _then_ it is rejected.
- _Given_ a user without the refund permission, _then_ no refund action is shown.

**BILL-005**

- _Given_ a wrongly marked attendance, _when_ a user with permission reverses it with a reason, _then_ a reversal entry offsets the charge, the original remains visible, and the session count decreases by one.
- _Given_ an entry is already reversed, _when_ reversing again is tried, _then_ it is refused.

**BILL-006**

- _Given_ two receptions at branch MUM issue receipts at the same moment, _then_ the numbers are consecutive with no duplicate and no gap.
- _Given_ the date is 1 April 2027, _when_ a receipt is issued, _then_ the number uses the `2027-28` series starting at `0001`.
- _Given_ a payment is reversed, _then_ a reversal receipt with its own number is issued, and the original number is not reused.

**BILL-007**

- _Given_ a patient with visits in an episode, _when_ an invoice is requested for that episode, _then_ a PDF lists each session, its fee, discounts, payments, and the total.

**REP-001 / REP-002 / REP-003**

- _Given_ a day with 12 visits and ₹6,000 in payments, _when_ the Owner opens the dashboard, _then_ it shows 12 patients seen and ₹6,000 collected.
- _Given_ a reversed payment, _when_ viewing collections, _then_ the net amount excludes it and the reversal is visible.
- _Given_ a report is on screen, _when_ the Owner chooses export, _then_ a file matches the on-screen figures.

**IMP-001**

- _Given_ an Excel file with 200 rows of which 5 miss gender, _when_ previewed, _then_ the 5 are listed with errors and the other 195 can be imported.
- _Given_ the import completes, _then_ a result report shows created, skipped as duplicates, and failed rows.

**SUB-001 / ADM-001**

- _Given_ a plan limit of 2 branches, _when_ the Owner adds a third, _then_ the system refuses with a message to contact support.
- _Given_ the super-admin suspends a tenant, _when_ its users log in, _then_ they see the suspended-account behaviour defined in OQ-11.

**AUD-001**

- _Given_ any logged event type occurs, _then_ an entry with user, time, branch, and action is stored and cannot be edited or deleted from the application.

---

## 12. User Journeys and Workflows

### 12.1 New walk-in patient (first visit)

```
Receptionist: search by name/phone ──► not found
   │
   ▼
Register (name, phone, age, gender) ──► start episode
   │
   ▼
Therapist: assessment (history, pain, ROM, diagnosis) ──► treatment plan
   │
   ▼
Mark attendance (charge = default fee or override)
   │
   ▼
Payment now?  ── yes ─► record payment ─► receipt
             └─ no  ─► balance shows dues
```

### 12.2 Returning patient (next day)

```
Search ──► open patient ──► dues warning shown if balance > 0
   │
   ▼
Mark attendance ──► optional session note by therapist
   │
   ▼
Payment (advance for several days, or pay later)
```

### 12.3 Correction

```
Wrong entry noticed ──► "Reverse" ──► reason
   │
   ▼
Reversal entry created; original stays; balance and session count updated
   │
   ▼
Re-enter the correct entry
```

### 12.4 Discharge and return

```
Therapist marks discharged (optional note) ──► patient moves to inactive list
   │
   ▼ (months later)
Patient returns ──► new episode ──► new assessment and plan; old history intact;
                                     ledger balance carries over
```

### 12.5 Clinic onboarding

```
Owner registers clinic (/register) ──► email code ──► clinic + 14-day trial + roles + Owner created, signed in
   │
   ▼
Setup: first branch (required)
   │
   ▼
Owner: clinic profile, more branches, default fee, staff, role permissions
   │
   ▼
(R2) Import Excel patient list ──► go live
```

## 13. Business Rules

| ID         | Rule                                                                                       | Source            |
| ---------- | ------------------------------------------------------------------------------------------ | ----------------- |
| BR-TEN-1   | Every record belongs to one tenant; no cross-tenant visibility.                            | C                 |
| BR-TEN-2   | Branch code is unique in the tenant and locked after the first receipt.                    | Rec               |
| BR-USR-1   | Receptionist and Therapist belong to exactly one branch; Owner sees all.                   | C (Q24)           |
| BR-USR-4   | Owner always has full permissions in its tenant.                                           | Rec               |
| BR-USR-5   | Permissions are per role; no per-user overrides or custom roles in MVP.                    | C (Q8)            |
| BR-PAT-1   | A patient belongs to the tenant, shared across branches.                                   | C (Q23)           |
| BR-PAT-4   | Any branch's staff can search and open any patient of the tenant.                          | C (Q28)           |
| BR-CLN-1   | Attendance belongs to an episode; an episode has one assessment and plan (versioned).      | C (Q48)           |
| BR-CLN-5   | Estimated cost on the plan is informational; no fixed packages.                            | C (Q18), inferred |
| BR-CLN-8   | Discharged patients return via a new episode.                                              | C (Q48)           |
| BR-VIS-1   | Each marked attendance counts as one session and creates one charge.                       | C                 |
| BR-VIS-4   | Outstanding balance shows a warning; it never blocks the visit.                            | C (Q27)           |
| BR-BILL-1  | A default-fee change applies to future visits only; each visit stores its fee.             | C (Q49)           |
| BR-BILL-4  | Ledger entries are never edited or deleted; corrections use reversals, including same day. | C (Q25)           |
| BR-BILL-8  | A payment may exceed dues, creating advance credit.                                        | C (Q16)           |
| BR-BILL-10 | Refunds need a permission the Owner assigns; reason is recorded.                           | C (Q26)           |
| BR-BILL-17 | Receipt numbers are sequential per branch per financial year; never reused.                | C (Q50)           |
| BR-BILL-7  | Payments apply to the patient account as a whole, not to specific visits.                  | A                 |
| BR-AUD-1   | Viewing a patient record is logged.                                                        | C (R-1), Rec      |
| BR-SUB-1   | Plan limits and feature flags are data, not code.                                          | C (A-1)           |

Rules still to define: payment allocation to visits for reporting (OQ-9), visit marked at the wrong branch, back-dated entries (Rec: not allowed for staff; Owner only, logged), and multiple visits per day.

## 14. Screen and Module Specifications

| #    | Screen / module        | Purpose                             | Key elements                                                                                                                         | Release     |
| ---- | ---------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| S-01 | Login                  | Sign in                             | Email, password, forgot password                                                                                                     | R1          |
| S-02 | OTP entry              | Verify new device                   | 6-digit code, resend, "trust this device"                                                                                            | R1          |
| S-03 | **Receptionist home**  | Daily work                          | Search box (name/phone); prominent "Register new patient"; today's visits list with quick "mark attendance" and "take payment"       | R1 (C, Q33) |
| S-04 | Register patient       | Fast intake                         | Mandatory: name, phone, age, gender; optional extras; duplicate warning                                                              | R1          |
| S-05 | Patient profile        | Everything about one patient        | Header: name, age, gender, phone, status, **balance/credit**; tabs Overview, Treatment, Visits, Payments; quick actions; branch tags | R1 (C, Q34) |
| S-06 | Assessment form        | Initial assessment                  | History, pain, ROM, diagnosis + recommended fields; version history                                                                  | R1          |
| S-07 | Treatment plan         | Plan editor                         | Diagnosis, goals, sessions and frequency, therapy types, estimated cost, notes                                                       | R1          |
| S-08 | Mark attendance        | Create visit                        | Patient, episode, therapist, fee (override with reason), warning banner                                                              | R1          |
| S-09 | Record payment         | Capture payment                     | Amount, method, reference, date; shows balance before/after                                                                          | R1          |
| S-10 | Receipt / invoice view | Print or PDF                        | Clinic details, number, items                                                                                                        | R1          |
| S-11 | Reverse entry          | Correct mistakes                    | Entry details, reason, confirm                                                                                                       | R1          |
| S-12 | Refund                 | Refund advance                      | Amount, method, reason                                                                                                               | R1          |
| S-13 | Discharge              | End episode                         | Optional note, dues prompt                                                                                                           | R1          |
| S-14 | Clinic settings        | Setup                               | Profile and branding, default fee, inactive-days setting                                                                             | R1          |
| S-15 | Branches               | Branch CRUD                         | Name, address, code                                                                                                                  | R1          |
| S-16 | Staff                  | Staff CRUD                          | Name, email, role, branch, active                                                                                                    | R1          |
| S-17 | Role permissions       | Permission editor                   | Matrix of permissions per role                                                                                                       | R1          |
| S-18 | Trusted devices        | Device list                         | Device, last used, revoke                                                                                                            | R1          |
| S-19 | Audit log              | Review activity                     | Filter by user, patient, action, date                                                                                                | R1          |
| S-20 | Owner dashboard        | Daily view                          | Patients seen, collections, dues                                                                                                     | R1/R2       |
| S-21 | Reports                | Revenue, dues, by branch, by method | Filters, export                                                                                                                      | R2          |
| S-22 | Import wizard          | Excel import                        | Upload, map, validate, preview, result                                                                                               | R2          |
| S-23 | Data export            | Owner export                        | Choose data, download                                                                                                                | R2          |
| S-24 | Inactive patients      | Follow-up list                      | Patients with no visit in N days                                                                                                     | R2          |
| S-25 | Super-admin: tenants   | Platform admin                      | Tenant list, create, suspend, plan and usage                                                                                         | R1 min / R2 |
| S-26 | Super-admin: plans     | Plan limits and features            | Limits, flags                                                                                                                        | R2          |

**UX guidelines (Rec unless noted):** responsive layout for phone, tablet, and desktop (C, Q31); installable PWA with app icon (C, Q31); English only (C, Q35) with text kept out of code to ease later translation; online only, with a clear "no connection" state and no silent failure (C, Q32); large tap targets and minimal typing at the front desk; global patient search always reachable.

## 15. Data Requirements and Entity Relationships

### 15.1 Entities

| Entity                                 | Key attributes                                                                                                                             | Notes                           |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| **Tenant**                             | id, name, address, phone, logo, registration details, status                                                                               | The clinic business             |
| **Plan**                               | id, name, limits (branches, users, patients), feature flags                                                                                | Data-driven (SUB-001)           |
| **Subscription**                       | tenant, plan, status (trial/active/suspended/cancelled), trial end                                                                         | No billing                      |
| **Branch**                             | id, tenant, name, address, code, active                                                                                                    |                                 |
| **User**                               | id, tenant (null for super-admin), email, name, role, branch, active, password hash                                                        |                                 |
| **Role / Permission / RolePermission** | role per tenant; fixed permission catalogue; grants                                                                                        | Designed for custom roles later |
| **TrustedDevice**                      | user, device token hash, last used, expires                                                                                                |                                 |
| **Patient**                            | id, tenant, name, phone, age/DOB, gender, optional fields, registered branch, status                                                       | One per tenant, across branches |
| **Episode**                            | id, patient, start, status (active/discharged), discharge date and note                                                                    |                                 |
| **Assessment** (versioned)             | episode, history, pain, ROM, diagnosis, extras, author, version                                                                            |                                 |
| **TreatmentPlan** (versioned)          | episode, diagnosis, goals, planned sessions, frequency, therapy types, estimated cost, notes                                               |                                 |
| **Visit**                              | id, episode, patient, branch, date-time, therapist, fee charged, fee override reason, marked by, status                                    | Attendance                      |
| **SessionNote** (versioned)            | visit, text, author                                                                                                                        |                                 |
| **FeeSetting**                         | tenant, default fee, effective from (history kept)                                                                                         | Optional patient-level fee      |
| **LedgerEntry**                        | id, patient, branch, type (charge/payment/refund/reversal), amount, method, reference, visit link, reversed-entry link, reason, user, time | Append-only                     |
| **Receipt / Invoice**                  | number, branch, financial year, ledger entry or period, issued at                                                                          |                                 |
| **NumberSequence**                     | branch, financial year, document type, last number                                                                                         | Concurrency-safe                |
| **AuditLog**                           | tenant, user, action, target, branch, time, details                                                                                        | Immutable                       |
| **ImportJob**                          | tenant, file, mapping, counts, status, user                                                                                                | R2                              |

### 15.2 Relationships

```
Plan 1──* Subscription *──1 Tenant
Tenant 1──* Branch
Tenant 1──* User *──1 Role ──* Permission
Tenant 1──* Patient 1──* Episode 1──* Assessment (versions)
                         │         1──* TreatmentPlan (versions)
                         │         1──* Visit 1──* SessionNote (versions)
                         └──* LedgerEntry  (charge links to Visit; reversal links to LedgerEntry)
Branch 1──* Visit,  Branch 1──* LedgerEntry,  Branch 1──* NumberSequence
LedgerEntry 1──0..1 Receipt
Tenant 1──* AuditLog
```

### 15.3 Data rules

- Every tenant-owned table carries `tenant_id`; every query is scoped by it (section 18).
- Money uses fixed-point decimals in INR (never floating point).
- Timestamps in UTC with display in India Standard Time.
- Soft states (inactive, discharged, reversed) replace deletes for clinical and financial data.
- Patient records are owned by the clinic business (tenant), not by individual staff or branches (Rec; legal roles of data controller/processor need review).

## 16. Roles and Permissions Matrix

The Owner edits the Receptionist and Physiotherapist columns per tenant (C, Q8). The matrix below is the **default template** for new tenants. Only the receptionist's "view clinical notes read-only" default and the Owner's full rights are confirmed (C, Q6, Q7); other defaults are **Rec** and the Owner can change them.

| Permission                                            | Owner/Admin | Receptionist (default) | Physiotherapist (default, Rec)        | Super-admin          |
| ----------------------------------------------------- | ----------- | ---------------------- | ------------------------------------- | -------------------- |
| Manage clinic profile, branches, default fee          | ✔           | ✘                      | ✘                                     | Platform only        |
| Manage staff                                          | ✔           | ✘                      | ✘                                     | ✘                    |
| Edit role permissions                                 | ✔           | ✘                      | ✘                                     | ✘                    |
| Register patient                                      | ✔           | ✔ (C)                  | ✘                                     | ✘                    |
| Edit patient demographics                             | ✔           | ✔                      | ✘                                     | ✘                    |
| Search / open any patient in tenant                   | ✔           | ✔                      | ✔                                     | ✘ (OQ-10)            |
| View clinical notes (assessment, plan, session notes) | ✔           | ✔ read-only (C)        | ✔                                     | ✘ (OQ-10)            |
| Edit assessment, plan, session notes                  | ✔           | ✘                      | ✔                                     | ✘                    |
| Mark attendance                                       | ✔           | ✔                      | ✔                                     | ✘                    |
| Override session fee                                  | ✔           | ✘                      | ✘                                     | ✘                    |
| Record payment                                        | ✔           | ✔ (C)                  | ✘                                     | ✘                    |
| View balances and payment history                     | ✔           | ✔                      | ✘ (own patients' dues indicator only) | ✘                    |
| Process refund                                        | ✔           | ✘                      | ✘                                     | ✘                    |
| Reverse an entry                                      | ✔           | ✘ (Rec)                | ✘                                     | ✘                    |
| Print receipt / generate invoice                      | ✔           | ✔                      | ✘                                     | ✘                    |
| Discharge patient / start episode                     | ✔           | ✘                      | ✔                                     | ✘                    |
| View dashboard and reports                            | ✔           | ✘                      | ✘                                     | Platform stats only  |
| Import / export data                                  | ✔           | ✘                      | ✘                                     | ✘                    |
| View audit log                                        | ✔           | ✘                      | ✘                                     | Platform events only |
| Manage trusted devices (others)                       | ✔           | ✘                      | ✘                                     | ✘                    |
| Create / suspend tenants, manage plans                | ✘           | ✘                      | ✘                                     | ✔                    |

**Branch scope:** Receptionist and Physiotherapist act only in their assigned branch for new visits and payments, but can view patients and their history from all branches (C, Q24, Q28).

**Note (R-2):** fully editable permissions need automated tests for each permission and warnings against lock-out.

---

## 17. Non-Functional Requirements

All values below are **Rec** targets for approval unless marked C.

| ID      | Area             | Requirement                                                                                                                                                                                   |
| ------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-001 | Platform (C)     | Responsive web app, installable PWA; supported browsers: current Chrome, Edge, Safari, Firefox and Android Chrome / iOS Safari (last 2 major versions).                                       |
| NFR-002 | Connectivity (C) | Online only. Show a clear offline state; block data entry; never imply a save succeeded when it did not.                                                                                      |
| NFR-003 | Language (C)     | English only; UI strings externalised for future translation.                                                                                                                                 |
| NFR-004 | Performance      | Page loads in under 3 s on a typical 4G phone; common API calls under 500 ms at p95 for up to 25 tenants.                                                                                     |
| NFR-005 | Scalability      | Sized for 5 to 25 clinics in year one (A-6), architecture able to grow to ~100 without rewrite.                                                                                               |
| NFR-006 | Availability     | Target 99.5% monthly during the pilot and R2; planned maintenance outside clinic hours.                                                                                                       |
| NFR-007 | Backups (C)      | Daily automated backups with point-in-time recovery from the database host; owner export to Excel (EXP-001). A restore test before launch.                                                    |
| NFR-008 | Accessibility    | Aim for WCAG 2.1 AA basics: keyboard use, contrast, labels, readable font sizes. (Not discussed; needs confirmation.)                                                                         |
| NFR-009 | Data integrity   | Ledger and receipt numbering run in database transactions; money in fixed-point decimals.                                                                                                     |
| NFR-010 | Observability    | Error monitoring and structured logs that never contain patient health data or passwords.                                                                                                     |
| NFR-011 | Maintainability  | Layered Express code (routes → services → data access), centralised permission checks, input validation on every endpoint, automated tests for permissions, tenant isolation, and the ledger. |
| NFR-012 | Portability      | Avoid host-specific features so the app can move from Render to another host (C, Q40).                                                                                                        |
| NFR-013 | Time and locale  | INR currency, Indian number format, IST display, financial year April to March.                                                                                                               |

**Technical direction (C unless stated):** React PWA frontend; Node.js with Express in TypeScript; managed PostgreSQL; hosted on Render for prototype with test data only, production host decided after legal review; email delivery service for OTP and password reset (vendor to be chosen).

## 18. Security and Privacy Requirements

| ID      | Requirement                                                                                                                                                                                       | Source         |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| SEC-001 | **Tenant isolation:** every query is filtered by tenant in the service layer. Evaluate PostgreSQL row-level security as a second safeguard. Automated tests must prove cross-tenant access fails. | Rec (R-7, R-8) |
| SEC-002 | Passwords hashed with a modern algorithm (Argon2id or bcrypt); never logged.                                                                                                                      | Rec            |
| SEC-003 | TLS for all traffic; encryption at rest via the managed database; secrets in environment configuration, not in code.                                                                              | Rec            |
| SEC-004 | Login rate limiting, account lockout, OTP attempt limits, session expiry.                                                                                                                         | Rec            |
| SEC-005 | Protection against common web attacks (injection, XSS, CSRF), input validation, secure headers.                                                                                                   | Rec            |
| SEC-006 | Authorization is checked on the server for every action; the UI hides actions but is never the control.                                                                                           | Rec            |
| SEC-007 | Audit log of record views and sensitive actions (AUD-001).                                                                                                                                        | C (R-1)        |
| SEC-008 | Least privilege: the app database user cannot alter the audit table or delete ledger rows.                                                                                                        | Rec            |
| SEC-009 | Dependency scanning and updates; no real patient data in non-production environments.                                                                                                             | Rec            |
| SEC-010 | **Independent security review** before real patient data goes live, covering tenant isolation, permissions, and the ledger.                                                                       | Rec (R-7)      |
| SEC-011 | Super-admin access to tenant data is restricted and logged (OQ-10).                                                                                                                               | Rec            |
| SEC-012 | Email OTP is acknowledged as weaker than an authenticator app; authenticator-app 2FA is a later enhancement.                                                                                      | C (R-11)       |

**Privacy:** collect only needed data; mandatory patient fields are only name, phone, age, gender; clinical notes are visible only to roles permitted by the Owner; patient-facing documents contain only what is necessary.

## 19. Applicable Indian Regulatory Considerations

> These are **flags for professional review**, not statements of compliance or legal requirements. Do not rely on this section as legal advice.

| #     | Topic                                                                                                                                                                      | What must be validated                                                                                                                                                                    | Who                           |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| REG-1 | **Personal data protection** — Digital Personal Data Protection Act, 2023 and its rules; earlier IT Act 2000 provisions and rules on sensitive personal data (health data) | Whether and how consent, notice, purpose limitation, retention, breach notification, and data-principal rights apply; roles of clinic (controller) versus platform (processor); timelines | Lawyer                        |
| REG-2 | **Data location**                                                                                                                                                          | Whether patient health data may be stored outside India (Render prototype regions may be outside India; Q40). Resolve before any real patient data is stored.                             | Lawyer                        |
| REG-3 | **Medical record retention**                                                                                                                                               | How long physiotherapy records must be kept, and what happens to a tenant's data on cancellation (OQ-6)                                                                                   | Lawyer / professional bodies  |
| REG-4 | **Receipts, invoices, numbering, GST**                                                                                                                                     | Whether receipts need specific content; GST treatment of physiotherapy services; whether sequential numbering per branch per financial year suffices; GST tax invoices are out of MVP     | Chartered accountant          |
| REG-5 | **Professional and clinical-establishment rules**                                                                                                                          | Registration or documentation duties for physiotherapists and clinics (central and state-level) that might affect record content                                                          | Lawyer / professional council |
| REG-6 | **Electronic records and signatures**                                                                                                                                      | Validity of electronic clinical notes and receipts                                                                                                                                        | Lawyer                        |
| REG-7 | **SMS/WhatsApp messaging rules**                                                                                                                                           | Telecom rules (such as DLT registration) and consent — relevant later when messaging is added                                                                                             | Lawyer                        |
| REG-8 | **Terms of service and privacy policy**                                                                                                                                    | Tenant agreement, data-processing terms, patient notice templates for clinics                                                                                                             | Lawyer                        |

## 20. Integration Requirements

| ID      | Integration                    | Purpose                          | Release | Note                              |
| ------- | ------------------------------ | -------------------------------- | ------- | --------------------------------- |
| INT-001 | **Email delivery service**     | OTP, password reset, invitations | R1      | Vendor TBD; small recurring cost  |
| INT-002 | PDF generation                 | Receipts and invoices            | R1      | Server-side or in-browser         |
| INT-003 | Excel read/write               | Import and export                | R2      | Library-based                     |
| INT-004 | Hosting and managed PostgreSQL | Run the product                  | R1      | Render for prototype (C, Q39/Q40) |
| INT-005 | Error monitoring               | Detect failures                  | R1      | Rec                               |
| INT-006 | WhatsApp/SMS                   | Messages and reminders           | Later   | Out of scope                      |
| INT-007 | Payment gateway                | Subscription payments            | Later   | Out of scope                      |
| INT-008 | Object storage                 | Patient documents                | Later   | Out of scope                      |

## 21. Reporting and Analytics Requirements

| ID       | Report                                               | Content                                              | Release |
| -------- | ---------------------------------------------------- | ---------------------------------------------------- | ------- |
| REP-001  | Owner dashboard                                      | Today's patients seen, collections, outstanding dues | R1      |
| REP-002a | Revenue                                              | Daily, weekly, monthly collections and charges       | R2      |
| REP-002b | Outstanding balances                                 | Patients with dues, amount, last visit, branch       | R2      |
| REP-002c | By branch                                            | Visits and revenue per branch                        | R2      |
| REP-002d | By payment method                                    | Cash, UPI, card, bank transfer                       | R2      |
| REP-003  | Export                                               | Excel / PDF of any report                            | R2      |
| INA-001  | Inactive patients                                    | No visit in N days                                   | R2      |
| (later)  | Therapist-wise, expenses, new vs returning, progress |                                                      | Later   |

Reports must reconcile with the ledger: totals equal the sum of entries for the period, with reversals and refunds shown.

## 22. Error States and Edge Cases

| Situation                                              | Expected handling                                                                                         |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Internet drops while saving a payment                  | Show failure clearly; do not show success; user retries; duplicate protection on retry (idempotency, Rec) |
| Two users mark attendance for the same patient at once | Warn on duplicate same-day visit; both visits allowed only with confirmation                              |
| Wrong patient or wrong amount                          | Reversal flow; original stays visible                                                                     |
| Patient has no phone                                   | Allow guardian's number; mark the contact type (Rec)                                                      |
| Two patients share one phone                           | Allowed; search shows both                                                                                |
| Visit marked with no active episode                    | Prompt to start an episode first                                                                          |
| Plan sessions exceeded                                 | Notice only                                                                                               |
| Patient with dues is discharged                        | Prompt; discharge still completes                                                                         |
| Receipt number collision under load                    | Prevented by transactional sequence; tested                                                               |
| Financial-year rollover                                | New series starts from 0001 on 1 April                                                                    |
| Refund greater than credit                             | Rejected                                                                                                  |
| Reversing an already reversed entry                    | Refused                                                                                                   |
| User's permission removed mid-task                     | Next action is refused with an explanation                                                                |
| Staff moves branches                                   | Owner reassigns; old records keep the original branch tag                                                 |
| Tenant suspended                                       | Behaviour per OQ-11                                                                                       |
| Lost or shared device                                  | Owner revokes trusted device; forced OTP                                                                  |
| Import with bad data                                   | Row-level errors; nothing partial is committed without confirmation                                       |
| Plan limit reached                                     | Clear message; no data loss                                                                               |
| Email not received (OTP)                               | Resend with rate limit; alternate recovery via Owner/super-admin (Rec)                                    |
| Clock or timezone differences                          | Store UTC; display IST                                                                                    |

## 23. Dependencies and Risks

| ID   | Risk / dependency                                                | Impact                                    | Mitigation                                                      |
| ---- | ---------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------- |
| R-1  | Receptionists can read clinical notes                            | Privacy exposure                          | Audit log of views; Owner can remove permission                 |
| R-2  | Fully flexible permissions                                       | Complexity, misconfiguration, lock-out    | Default templates; tests; warnings; audit of changes            |
| R-3  | No calendar: double-booking and availability problems not solved | Less value for clinics wanting booking    | Data model leaves room for appointments; add in a later release |
| R-4  | No document upload                                               | Clinics keep paper or WhatsApp copies     | Reconsider in the first post-MVP release                        |
| R-5  | PWA limits (iOS push, no app store)                              | Fewer notification options later          | Acceptable for MVP                                              |
| R-6  | English-only                                                     | Smaller adoption in some regions          | Externalise strings now                                         |
| R-7  | AI-generated code in a health and finance system                 | Security and correctness defects          | Code review, automated tests, independent security review       |
| R-8  | Custom backend with no ready-made auth/isolation                 | More to build and secure                  | Established libraries; RLS evaluation                           |
| R-9  | Express has no enforced structure                                | Inconsistent code                         | Layered conventions (NFR-011)                                   |
| R-10 | Render may lack an India region                                  | Health data stored abroad                 | Test data only; legal review; plan host move                    |
| R-11 | Email OTP weaker than authenticator                              | Account takeover via email                | Owner-level monitoring; later authenticator option              |
| R-12 | Two-month pilot vs scope                                         | Slip or quality compromise                | Move the dashboard to R2 first; cut non-essential polish        |
| R-13 | Real patient data in pilot before legal review                   | Legal exposure                            | Test data or consented, compliant host only                     |
| R-14 | Budget undefined (OQ-7)                                          | Security review and legal advice unfunded | Fix a budget before launch                                      |
| R-15 | Ledger design errors                                             | Wrong balances, lost trust                | Append-only design, transactional writes, reconciliation tests  |

**Dependencies:** legal advice (data location, retention, consent); chartered accountant (receipt numbering, GST); email vendor; hosting decision; at least one pilot clinic; security reviewer; domain name and SSL.

## 24. Success Metrics

Proposed targets (Rec) for approval:

| Metric                                          | Target                             |
| ----------------------------------------------- | ---------------------------------- |
| Pilot clinics live                              | 2 clinics for at least 4 weeks     |
| New patient registration time                   | Under 60 seconds at the front desk |
| Visits recorded in the system the same day      | At least 95%                       |
| Ledger discrepancies found by pilot owners      | 0                                  |
| Receptionist satisfaction (simple survey)       | 4 of 5 or better                   |
| Paper/Excel still used for records after week 4 | Under 10% of visits                |
| Onboarding time (R2, with Excel import)         | Under 1 day per clinic             |
| Critical security findings open at launch       | 0                                  |
| System availability (R2)                        | 99.5% monthly                      |

Business metrics (clinic count, subscription conversion, churn) are not set until budget, pricing, and expected clinic counts are known (OQ-7, OQ-8, OQ-12).

## 25. Release Plan

| Release              | Timeline                       | Content                                                                                                                                            | Gate                                                                                            |
| -------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **R0 — Foundations** | Weeks 1 to 2                   | Repo, hosting (test data), auth skeleton, tenancy and permission model, CI, test harness for tenant isolation                                      | Isolation tests pass                                                                            |
| **R1 — Pilot**       | Up to about week 8             | AUTH, TEN, USR, PAT, CLN, VIS, BILL, AUD; basic dashboard if time allows                                                                           | Pilot clinic runs a full day; ledger reconciles; legal answer on data location before real data |
| **R2 — Full MVP**    | Months 4 to 6                  | IMP, REP full, EXP, ADM console, SUB groundwork, INA flag, security review fixes, restore test, onboarding polish                                  | Security review passed; legal and CA items resolved or accepted                                 |
| **Later phases**     | After R2, priority by feedback | Document upload, WhatsApp/SMS, calendar and booking, reminders, progress tracking, expenses, packages, more roles, authenticator 2FA, translations | —                                                                                               |

Timeline is aspirational for a solo, AI-assisted build and depends on budget and legal outcomes (R-12, R-14).

## 26. Open Questions and Assumptions

### 26.1 Open questions

| ID    | Question                                                                                       | Needed by                    |
| ----- | ---------------------------------------------------------------------------------------------- | ---------------------------- |
| OQ-1  | Confirm the treatment plan's estimated cost is informational only (inferred from Q18).         | Before R1 build of CLN-003   |
| OQ-2  | Which clinic details must appear on receipts (logo, registration number, address, GST number)? | Before BILL-006              |
| OQ-4  | Excel import: columns, duplicate rule, treatment of old balances and visit history.            | Before R2                    |
| OQ-5  | Production hosting and data location.                                                          | Before any real patient data |
| OQ-6  | Record retention period; tenant data handling on cancellation.                                 | Before launch                |
| OQ-7  | Budget for build, security review, legal advice, and running costs.                            | Before R1 end                |
| OQ-8  | Expected number of clinics in year one.                                                        | Before R2 sizing             |
| OQ-9  | Should reports allocate payments to specific visits, or stay account-level?                    | Before REP-002               |
| OQ-10 | Can the super-admin ever view patient data (support access)? Recommended: no by default.       | Before ADM-001               |
| OQ-11 | Behaviour of a suspended or cancelled tenant (Rec: read-only plus export).                     | Before SUB-001               |
| OQ-12 | Subscription pricing model and trial length.                                                   | Before billing is built      |
| OQ-13 | Accessibility target (WCAG 2.1 AA proposed).                                                   | Before UI build              |
| OQ-14 | Back-dated entries and entries at the wrong branch: who may correct them?                      | Before BILL build            |

### 26.2 Assumptions

| ID   | Assumption                                                                                                                      |
| ---- | ------------------------------------------------------------------------------------------------------------------------------- |
| A-1  | Subscription groundwork only: plans, limits, flags, trial status; no payment collection in the MVP. (C)                         |
| A-2  | Returning patients are found by name or phone search to avoid duplicates.                                                       |
| A-3  | One fixed assessment form; no configurable templates.                                                                           |
| A-4  | Owners enter clinic details and logo for receipts during setup.                                                                 |
| A-5  | Build cost is the product owner's time plus AI tool subscriptions; security review, legal, and hosting are budgeted separately. |
| A-6  | Sized for 5 to 25 clinics in year one.                                                                                          |
| A-7  | Planned session count is a guide, not a limit.                                                                                  |
| A-8  | Payments apply at account level, not per visit.                                                                                 |
| A-9  | Default permission templates for the Physiotherapist role are as in section 16.                                                 |
| A-10 | Staff cannot back-date entries; the Owner can, with a log entry.                                                                |

### Appendix A — Decision log (confirmed)

| Ref        | Decision                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------ |
| Q1         | Multi-tenant SaaS; each tenant can have multiple branches                                  |
| Q2         | Target: small clinics, 2 to 5 therapists, 1 to 2 branches                                  |
| Q3         | Priorities: patient records, appointments, billing; progress tracking and follow-ups later |
| Q4         | Pricing later; architecture must support it                                                |
| Q5         | Roles: Owner/Admin, Receptionist, Physiotherapist, Super-admin; no patient login           |
| Q6, Q7     | Receptionist can view clinical notes read-only; permissions are owner-managed              |
| Q8         | Permissions per role; no overrides or custom roles in MVP                                  |
| Q9         | Patients are mainly walk-ins                                                               |
| Q10        | Mandatory fields: name, phone, age, gender                                                 |
| Q11        | First visit: assessment and treatment plan; treatment may start same day                   |
| Q12        | Plan includes diagnosis, goals, sessions and frequency, therapy types, estimated cost      |
| Q13        | Attendance always marked; short note optional                                              |
| Q14        | Follow-ups are not pre-booked; attendance marked when the patient comes                    |
| Q15        | No calendar in MVP                                                                         |
| Q16, Q18   | Flexible payment timing; running account; no fixed packages                                |
| Q17        | Payment methods: cash, UPI, card, bank transfer                                            |
| Q19        | Default fee with override                                                                  |
| Q20        | Receipt per payment; invoice on request; no GST invoice                                    |
| Q21        | Discharge by therapist; inactive flag                                                      |
| Q22        | Dashboard and reports as listed in section 21                                              |
| Q23, Q28   | One patient record across branches; any branch can search all                              |
| Q24        | Staff assigned to one branch                                                               |
| Q25        | Nothing deleted; reversals                                                                 |
| Q26        | Refund or credit case by case                                                              |
| Q27        | Dues warning, not a block                                                                  |
| Q29, Q30   | Only Excel import added; no document upload                                                |
| Q31        | Responsive web app with PWA                                                                |
| Q32        | Online only                                                                                |
| Q33, Q34   | Receptionist home and patient profile as specified                                         |
| Q35        | English only                                                                               |
| Q36 to Q38 | AI-assisted build; custom backend; TypeScript, Express, PostgreSQL, React                  |
| Q39, Q40   | Render for prototype, test data only; production host later                                |
| Q41        | Email and password, email OTP on new devices                                               |
| Q42        | Daily backups plus owner export                                                            |
| Q43, Q44   | Two releases: Pilot (about 2 months) and Full MVP (4 to 6 months)                          |
| Q45, Q46   | Budget and clinic count undecided                                                          |
| Q48        | Episodes for returning patients                                                            |
| Q49        | Fee changes apply to future visits                                                         |
| Q50        | Receipt numbers per branch per financial year                                              |
| Q51        | Scope approved                                                                             |

---

## 27. Requirements Traceability Matrix

| Problem / objective           | Requirement IDs                                          | Business rules           | User stories                        | Release    | Test basis                    |
| ----------------------------- | -------------------------------------------------------- | ------------------------ | ----------------------------------- | ---------- | ----------------------------- |
| Messy records (P1)            | PAT-001 to PAT-005, CLN-001 to CLN-004, VIS-002, VIS-003 | BR-PAT-1/4, BR-CLN-1/4/8 | US-08 to US-13, US-15, US-24, US-25 | R1         | Section 11: PAT, CLN          |
| Visits hard to manage (P2)    | VIS-001, VIS-003, INA-001                                | BR-VIS-1/4/5             | US-14, US-32                        | R1/R2      | VIS-001                       |
| Billing and dues (P3)         | BILL-001 to BILL-008                                     | BR-BILL-1 to 20          | US-16 to US-23                      | R1         | BILL                          |
| Control and privacy           | USR-001, USR-002, AUD-001, AUTH-001 to 004               | BR-USR, BR-AUD-1         | US-01 to 03, US-06, US-07, US-31    | R1         | AUTH, USR, AUD                |
| Multi-tenant SaaS (BO-4)      | TEN-001, TEN-002, ADM-001, SEC-001                       | BR-TEN-1                 | US-04, US-05, US-33                 | R1/R2      | TEN                           |
| Subscription readiness (BO-5) | SUB-001                                                  | BR-SUB-1                 | US-33                               | R2         | SUB                           |
| Move off paper/Excel (BO-2)   | IMP-001, EXP-001                                         | —                        | US-29, US-30                        | R2         | IMP, EXP                      |
| Owner visibility              | REP-001 to REP-003                                       | BR-REP-1                 | US-26 to US-28                      | R1/R2      | REP                           |
| Trust and safety              | SEC-001 to SEC-012, NFR-002, NFR-007, NFR-009            | —                        | —                                   | R1/R2      | Security review, restore test |
| Compliance flags              | REG-1 to REG-8                                           | —                        | —                                   | Pre-launch | Professional review           |

---

## Next deliverables (offered, not yet created)

MVP feature checklist; user stories with full acceptance criteria; functional requirements specification; user flow diagrams; database ER diagram; API requirements; role and permission matrix (detailed); development backlog; release roadmap; QA test scenarios. Tell me which one you want next.
