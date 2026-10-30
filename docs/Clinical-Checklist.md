# Clinical Section Checklist

|              |                                                                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Version**  | 1.0                                                                                                                                                    |
| **Date**     | 2026-10-29                                                                                                                                             |
| **Based on** | [User-Stories.md](User-Stories.md) Epic 4 (US-12, US-13, US-24, US-25), [API-Requirements.md](API-Requirements.md) 5.4, [ER-Diagram.md](ER-Diagram.md) |
| **Use**      | Tick items off as they are built. A story is done when every scenario under it passes. Scenario IDs match User-Stories.md.                             |

**Scope:** Release 1, Clinical (CLN-001 to CLN-004). Scenarios that need Visits or Billing are marked **[needs Visits]** or **[needs Billing]**. Build the part that works now and leave a seam; tick the scenario when the other section lands.

**Permission keys:** `clinical.view`, `clinical.edit`, `episode.manage` (start episode and discharge). BR-CLN-9 names a "discharge patient" permission; the API doc maps it to `episode.manage`. Confirm before building US-24.4.

---

## 1. Data model and database

- [x] Prisma models `Episode`, `Assessment`, `TreatmentPlan` from the ER document, each with `tenantId`
- [x] Policies for all three in `db/tenantScope.ts` (compile error otherwise); episode status changes go through one whitelisted function, like `updateClinicProfile`
- [x] Migration: partial unique index, one active episode per patient (`episode (patient_id) where status = 'active'`, CON-11)
- [x] Migration: `unique (episode_id, version)` on assessment and treatment plan (CON-12)
- [x] Migration: index for episode lookup by patient
- [x] Money: `estimated_cost` is `numeric(12,2)`, string in JSON
- [x] Append-only: a database trigger refuses UPDATE and DELETE on `assessment` and `treatment_plan` for every role (stronger than role grants; tests lift it only to clean up)
- [x] Cross-tenant 404 tests for all three (in `clinical.db.test.ts`)

## 2. API (server `modules/clinical`)

Rules file `clinicalRules.ts` (pure, unit tested), then `clinical.routes.ts`, `clinical.schemas.ts`, `clinical.service.ts`.

- [x] `GET /patients/{id}/episodes` (`patient.view`) newest first, with status and dates
- [x] `POST /patients/{id}/episodes` (`episode.manage`) → 409 `EPISODE_ALREADY_ACTIVE` when one exists
- [x] `GET /episodes/{id}` (`clinical.view`) with latest assessment, latest plan, session count; writes a view audit entry
- [x] `POST /episodes/{id}/assessments` (`clinical.edit`) creates the next version
- [x] `GET /episodes/{id}/assessments` (`clinical.view`) all versions
- [x] `POST /episodes/{id}/treatment-plans` (`clinical.edit`) creates the next version
- [x] `GET /episodes/{id}/treatment-plans` (`clinical.view`) all versions
- [x] `POST /episodes/{id}/discharge` (`episode.manage`) optional note; returns balance for the prompt; never blocks on dues
- [x] Writes refused on a discharged episode (assessment and plan are read-only after discharge)
- [x] Version number taken inside a transaction so two simultaneous saves cannot clash; the loser gets a clear 409
- [x] Every endpoint: permission check in the service layer (XC-02) and cross-tenant 404 test (XC-01)
- [x] Validation messages name the field and the fix (XC-10)
- [x] Fill the seams in `patients.service.ts`: `activeEpisodeId` now real; `lastVisitAt` and `balanceFor` stay for Visits and Billing
- [x] Update `server/CLAUDE.md` (Clinical module paragraph, "Not built yet" list)

## 3. Audit entries

- [x] `episode.started`, `episode.discharged` (with the note flag, not the note text)
- [x] `assessment.viewed`, `assessment.created` (version number)
- [x] `treatment_plan.created` (version number)
- [x] Entries carry user, time, branch, action, target; no clinical text in the log (NFR-010)

## 4. User stories

### US-25 / CLN-001 — Start an episode

- [x] **US-25.1** Discharged patient: starting a new episode makes the patient active with an empty assessment and plan
- [x] **US-25.2** Earlier episodes stay viewable and unchanged
- [x] **US-25.3** A patient with an active episode cannot get a second one (server rule and the button hidden)
- [x] **US-25.4** Ledger balance carries into the new episode **[needs Billing]** (balance is per patient, so nothing is copied; add a test once the ledger exists)
- [x] **US-25.5** Marking attendance with no active episode asks to start one first **[needs Visits]**
- [x] First episode for a brand-new patient uses the same flow (patient profile "Start episode")
- [x] Episode records the branch it started at (`started_branch_id`)

### US-12 / CLN-002 — Initial assessment

- [x] **US-12.1** Saving on an active episode stores version 1 with author and time
- [x] **US-12.2** Editing creates version + 1; earlier versions stay viewable (version picker or history list)
- [x] **US-12.3** Receptionist with read access sees the assessment but cannot edit it
- [x] **US-12.4** Without `clinical.view` the assessment is not shown (section hidden, API refuses)
- [x] **US-12.5** Viewing an assessment writes an audit entry with the viewer
- [x] Fields: history, pain, range of motion, diagnosis, chief complaint, pain score (0 to 10 in `extra_fields`)
- [x] Empty save refused; unchanged resave does not create a new version

### US-13 / CLN-003 — Treatment plan

- [x] **US-13.1** Saving stores plan version 1
- [x] **US-13.2** Changing the plan saves a new version; history kept
- [x] **US-13.3** Estimated cost shown as "Estimate only" and creates no charge (BR-CLN-5)
- [x] **US-13.4** Free-text exercise instructions go in plan notes; no exercise library
- [x] **US-13.5** Plan of 10 sessions, 11th visit: notice that the plan is exceeded, visit still allowed **[needs Visits]**
- [x] Fields: diagnosis, goals, planned sessions (whole number, 1 or more), frequency, therapy types, estimated cost (not negative), notes
- [x] Plan progress shown on the profile ("session 6 of 10") **[needs Visits]** for the count; the display and the "no plan yet" state ship now

### US-24 / CLN-004 — Discharge

- [x] **US-24.1** Confirm discharge with optional note: episode and patient show as discharged and move to the inactive list
- [x] **US-24.2** Dues shown at discharge; discharge still completes **[needs Billing]**
- [x] **US-24.3** Advance credit prompts "refund or keep as credit" **[needs Billing]**
- [x] **US-24.4** Without the discharge permission the action is not shown, and the API refuses
- [x] Confirmation dialog states what discharge does; double click creates no second discharge
- [x] Patient list status filter shows discharged patients correctly

## 5. Client

- [x] `client/src/features/clinical/` with API hooks (`api/`), types, and strings in the strings file (NFR-003)
- [x] Treatment tab on `PatientTabs.tsx` replaces the "waits for Clinical" placeholder
- [x] Episode header: status, start date, branch, plan progress
- [x] "Start episode" and "Discharge" buttons shown only with `episode.manage`
- [x] Assessment form and plan form (edit in place, save creates a new version); read-only view for `clinical.view` only
- [x] Version history list for assessment and plan, opening any earlier version read-only
- [x] Past episodes list; opening one is read-only
- [x] Discharge dialog with note, and slots for dues and advance-credit prompts
- [x] Hide whole clinical sections when `clinical.view` is missing
- [x] Save buttons disabled while saving; failure shown, never claimed as success (XC-03)
- [ ] Works on phone, tablet, desktop (XC-07): built mobile-first; still to check by hand on real devices
- [x] Update `client/CLAUDE.md`

## 6. Tests

- [x] `test/clinicalRules.test.ts` pure rules: version increment, unchanged-resave detection, plan validation
- [x] `test/clinical.db.test.ts` one active episode, versions, discharge, new episode after discharge, read-only after discharge, cross-tenant 404, permission refusal, audit entries
- [x] Concurrency test: two simultaneous assessment saves do not duplicate a version
- [x] Client tests: form rules (`clinicalForm.test.ts`), buttons follow permissions and discharged episodes are read-only (`TreatmentTab.test.tsx`)
- [x] `npm run typecheck && npm run lint && npm test && npm run build` pass in `server` and `client`
- [ ] Seed script adds fictional episodes, assessments and plans to dev data (refuses production)

## 7. Done when

- [ ] Every scenario above is ticked, or marked with the section it waits for
- [x] [MVP-Checklist.md](MVP-Checklist.md) Clinical items ticked: CLN-001, CLN-002, CLN-003, CLN-004, reactivate by new episode
- [ ] "Plan progress" item in MVP-Checklist stays open until Visits lands
- [x] Patients items waiting on Clinical (PAT-003 Treatment tab) updated

## Decisions to confirm

| ID           | Decision                                                                      | Needed before |
| ------------ | ----------------------------------------------------------------------------- | ------------- |
| BR-CLN-9     | Discharge uses `episode.manage` or a separate "discharge patient" permission  | US-24.4       |
| OQ-1         | Estimated cost is informational only (inferred from Q18)                      | US-13.3       |
| Receptionist | Whether the default Receptionist role holds `clinical.view` (read) or not     | US-12.3/12.4  |
| Assessment   | Who may start an episode: Physiotherapist only, or Receptionist too (US-25.5) | US-25.1       |
