# User Stories and Acceptance Criteria

|              |                                                                                    |
| ------------ | ---------------------------------------------------------------------------------- |
| **Version**  | 1.0                                                                                |
| **Date**     | 2026-10-26                                                                         |
| **Based on** | [PRD.md](PRD.md) v1.0 sections 9 to 13                                             |
| **Format**   | Story, requirement link, preconditions, acceptance criteria in Given / When / Then |

**How to use:** each story has an ID (`US-nn`) matching the PRD. Each criterion has a scenario ID (`US-nn.k`) that QA and developers can cite. A story is done when all its scenarios pass.

**Source tags:** **C** confirmed by the product owner; **Rec** recommended, awaiting approval; **A** assumption.

**Default role names:** Owner, Receptionist, Physiotherapist, Super-admin. "Authorised" means the user's role holds the needed permission, which the Owner controls.

---

## Epic 1 — Authentication and access

### US-01 — Sign in with email and password

_As a_ user, _I want to_ sign in with my email and password, _so that_ I can reach my clinic's data. **Req:** AUTH-001 · **Rel:** R1 · **Pri:** Must · **Src:** C
**Preconditions:** the account exists, is active, and its clinic is active.

- **US-01.1** _Given_ correct credentials on a trusted device, _when_ I submit, _then_ I land on my home screen (receptionist home, or owner dashboard).
- **US-01.2** _Given_ a wrong password or unknown email, _when_ I submit, _then_ I see the same generic error either way.
- **US-01.3** _Given_ five failed attempts in a row, _when_ I try again during the lock period, _then_ I am refused even with the right password, and the message says to try later. _(Rec: 5 attempts, 15 minutes.)_
- **US-01.4** _Given_ my account is deactivated, _when_ I sign in, _then_ I am refused with a message to contact my clinic owner.
- **US-01.5** _Given_ my clinic is suspended, _when_ I sign in, _then_ I see the behaviour set by OQ-11.
- **US-01.6** _Given_ I am signed in and idle past the session limit, _when_ I act, _then_ I am asked to sign in again and nothing is lost that was already saved.

### US-02 — Verify a new device with an email code

_As a_ user, _I want to_ enter a code emailed to me on a new device, _so that_ my account is protected. **Req:** AUTH-002 · **Rel:** R1 · **Pri:** Must · **Src:** C

- **US-02.1** _Given_ correct credentials on an unrecognised device, _when_ I submit, _then_ a 6-digit code is emailed and I am asked for it before a session starts.
- **US-02.2** _Given_ the correct code within 10 minutes, _when_ I enter it, _then_ I sign in.
- **US-02.3** _Given_ a wrong or expired code, _when_ I enter it, _then_ access is refused. After 5 wrong attempts I must request a new code.
- **US-02.4** _Given_ I tick "trust this device", _when_ I sign in again within the trust period (Rec: 30 days), _then_ no code is asked.
- **US-02.5** _Given_ I request "resend", _when_ I ask too often, _then_ the request is rate limited.
- **US-02.6** _Given_ a used code, _when_ it is entered again, _then_ it is rejected.

### US-03 — Review and revoke trusted devices

_As an_ owner (or any user for my own devices), _I want to_ see and revoke trusted devices, _so that_ a lost or shared device cannot be used. **Req:** AUTH-003 · **Rel:** R1 · **Pri:** Must · **Src:** Rec

- **US-03.1** _Given_ I open my trusted devices, _then_ I see each device's label, last use, and expiry.
- **US-03.2** _Given_ I revoke a device, _when_ that device next signs in, _then_ an OTP is required.
- **US-03.3** _Given_ I am the owner, _when_ I revoke a staff member's device, _then_ the same applies and an audit entry is recorded.
- **US-03.4** _Given_ I am a receptionist or therapist, _then_ I cannot see other users' devices.

### US-03a — Reset or change my password

_As a_ user, _I want to_ reset a forgotten password or change my password, _so that_ I keep access. **Req:** AUTH-004 · **Rel:** R1 · **Pri:** Must · **Src:** Rec

- **US-03a.1** _Given_ I request a reset, _when_ the email exists or not, _then_ the message is the same ("if the account exists, an email was sent").
- **US-03a.2** _Given_ a reset link, _when_ I use it within its expiry, _then_ I can set a new password once; reuse of the link fails.
- **US-03a.3** _Given_ I set a password that is too weak, _then_ the form rejects it with a reason.
- **US-03a.4** _Given_ I change my password, _then_ my other sessions end and the change is audit-logged.

---

## Epic 2 — Clinics, branches, and staff

### US-04 — Register a clinic

_As a_ clinic owner, _I want to_ register my clinic myself, _so that_ I can start without waiting for anyone. **Req:** TEN-001 · **Rel:** R1 · **Pri:** Must · **Src:** C (self-registration decided 2026-10-27, replacing creation by the super-admin)

- **US-04.1** _Given_ I enter clinic name, my name, work email, mobile, a strong password and accept the terms, _when_ I submit, _then_ a 6-digit code is emailed to me and nothing is created yet.
- **US-04.2** _Given_ the correct code within 10 minutes, _when_ I enter it, _then_ my clinic exists on a 14-day trial with default permission templates (BR-USR-7), I am its Owner, and I am signed in.
- **US-04.3** _Given_ the email already belongs to a user, _when_ I submit, _then_ the page answers exactly as for a new email, and that address receives a "you already have an account" email instead of a code (DD-1, no account discovery).
- **US-04.4** _Given_ I just registered, _when_ I first open the app, _then_ I must add the first branch (name and code) before anything else.
- **US-04.5** _Given_ a wrong code five times, or resends too often, _then_ I must request a new code or wait (same limits as AUTH-002).

### US-04a — Maintain the clinic profile

_As an_ owner, _I want to_ set my clinic's name, address, phone, logo, and receipt details, _so that_ receipts look right. **Req:** TEN-001 · **Rel:** R1 · **Pri:** Must · **Src:** C (A-4)

- **US-04a.1** _Given_ I update the profile, _then_ new receipts show the new details and old receipts are unchanged.
- **US-04a.2** _Given_ a logo upload, _when_ it is not an image or is too large, _then_ it is rejected with a reason.

### US-05 — Manage branches

_As an_ owner, _I want to_ add and edit branches, _so that_ each location's work and numbers are separate. **Req:** TEN-002 · **Rel:** R1 · **Pri:** Must · **Src:** C

- **US-05.1** _Given_ a name, address, and a unique code, _when_ I save, _then_ the branch is created.
- **US-05.2** _Given_ a branch has issued a receipt, _when_ I try to change its code, _then_ the change is refused.
- **US-05.3** _Given_ a branch holds visits or payments, _when_ I try to delete it, _then_ I can only deactivate it.
- **US-05.4** _Given_ the plan allows two branches, _when_ I add a third, _then_ I am refused with a clear message (R2, SUB-001).
- **US-05.5** _Given_ I deactivate a branch with active staff, _then_ I am asked to reassign them first.

### US-06 — Manage staff

_As an_ owner, _I want to_ add staff and assign each to one branch, _so that_ the right people work in the right place. **Req:** USR-001 · **Rel:** R1 · **Pri:** Must · **Src:** C

- **US-06.1** _Given_ name, email, role, and branch, _when_ I save, _then_ the staff member receives an invitation.
- **US-06.2** _Given_ a receptionist or therapist, _then_ exactly one branch is required.
- **US-06.3** _Given_ I deactivate a staff member, _then_ they can no longer sign in, and their past entries still show their name.
- **US-06.4** _Given_ I am the only active owner, _when_ I try to deactivate myself, _then_ the action is blocked.
- **US-06.5** _Given_ I move staff to another branch, _then_ their old records keep the original branch tag and new work uses the new branch.
- **US-06.6** _Given_ a receptionist or therapist, _then_ they cannot reach staff management.

### US-07 — Set what each role can do

_As an_ owner, _I want to_ change the permissions of the Receptionist and Physiotherapist roles, _so that_ I control access to sensitive data and money. **Req:** USR-002 · **Rel:** R1 · **Pri:** Must · **Src:** C

- **US-07.1** _Given_ a new clinic, _then_ both roles start with the default templates.
- **US-07.2** _Given_ I remove "view clinical notes" from the Receptionist role, _when_ a receptionist next opens a patient, _then_ clinical sections are hidden.
- **US-07.3** _Given_ I add "process refund" to a role, _then_ users with that role see the refund action on their next request.
- **US-07.4** _Given_ I would remove a permission that leaves nobody able to record payments, _then_ I see a warning before saving.
- **US-07.5** _Given_ any change, _then_ an audit entry shows who changed what, with before and after.
- **US-07.6** _Given_ the Owner role, _then_ its permissions cannot be reduced.
- **US-07.7** _Given_ I look for per-user overrides or custom roles, _then_ they do not exist in the MVP.

---

## Epic 3 — Patients

### US-08 — Register a walk-in patient

_As a_ receptionist, _I want to_ register a patient with name, phone, age, and gender, _so that_ they are in the system within seconds. **Req:** PAT-001 · **Rel:** R1 · **Pri:** Must · **Src:** C
**Preconditions:** I hold "register patient".

- **US-08.1** _Given_ all four mandatory fields, _when_ I save, _then_ the patient is created with the registering branch.
- **US-08.2** _Given_ a mandatory field is empty or invalid, _when_ I save, _then_ the form names the field and does not save.
- **US-08.3** _Given_ another patient has the same phone, _when_ I save, _then_ I see the possible duplicate and can open it or create anyway.
- **US-08.4** _Given_ I enter a date of birth instead of an age, _then_ the age is derived (or the reverse).
- **US-08.5** _Given_ the patient has no own phone, _when_ I enter a guardian's number, _then_ it is marked as a guardian contact.
- **US-08.6** _Given_ a saved patient, _then_ I can go directly to starting an episode or marking attendance.
- **US-08.7** _Given_ the plan's patient limit is reached (R2), _then_ I am refused with a clear message.

### US-09 — Find a patient quickly

_As a_ receptionist, _I want to_ search by name or phone, _so that_ I find returning patients and avoid duplicates. **Req:** PAT-002 · **Rel:** R1 · **Pri:** Must · **Src:** C

- **US-09.1** _Given_ part of a phone number (4 or more digits), _then_ matching patients appear.
- **US-09.2** _Given_ part of a name in any letter case, _then_ matching patients appear.
- **US-09.3** _Given_ results, _then_ each shows name, phone, age, last visit date, last visit branch, and a dues indicator.
- **US-09.4** _Given_ many matches, _then_ results are paged and the most recent visitors come first.
- **US-09.5** _Given_ no match, _then_ a "Register new patient" shortcut is offered with the typed text pre-filled.

### US-10 — See the whole patient on one page

_As staff, I want to_ open a patient profile, _so that_ I see history, balance, and actions together. **Req:** PAT-003 · **Rel:** R1 · **Pri:** Must · **Src:** C (tabs: Rec)

- **US-10.1** _Given_ a patient, _then_ the header shows name, age, gender, phone, status, and the balance or advance credit.
- **US-10.2** _Given_ the tabs Overview, Treatment, Visits, and Payments, _then_ each shows its content according to my permissions.
- **US-10.3** _Given_ I lack "view ledger", _then_ the Payments tab and amounts are hidden.
- **US-10.4** _Given_ a patient owes money, _then_ the dues are shown prominently at the top.
- **US-10.5** _Given_ the profile opens, _then_ a "patient viewed" audit entry is recorded.
- **US-10.6** _Given_ quick actions, _then_ only those I am permitted to use are shown: mark attendance, record payment, discharge.

### US-11 — Open a patient from another branch

_As a_ receptionist, _I want to_ find a patient registered elsewhere, _so that_ they do not register again. **Req:** PAT-005 · **Rel:** R1 · **Pri:** Must · **Src:** C

- **US-11.1** _Given_ a patient registered at branch A, _when_ I search at branch B, _then_ I can open them with full history.
- **US-11.2** _Given_ a visit at another branch, _then_ it carries that branch's tag.
- **US-11.3** _Given_ dues from another branch, _then_ they are included in the balance and the warning.
- **US-11.4** _Given_ a patient of a different clinic, _then_ they never appear in my search.
- **US-11.5** _Given_ I open a record from another branch, _then_ the audit log shows the view.

### US-11a — Correct patient details

_As an_ authorised user, _I want to_ edit patient details, _so that_ mistakes are fixed. **Req:** PAT-004 · **Rel:** R1 · **Pri:** Must · **Src:** Rec

- **US-11a.1** _Given_ I change the phone number, _then_ the audit entry holds the old and new values.
- **US-11a.2** _Given_ the new phone matches another patient, _then_ the duplicate notice appears.
- **US-11a.3** _Given_ I lack the permission, _then_ the fields are read-only.

---

## Epic 4 — Clinical records

### US-12 — Record the initial assessment

_As a_ physiotherapist, _I want to_ record history, pain, range of motion, and diagnosis, _so that_ the patient's condition is documented. **Req:** CLN-002 · **Rel:** R1 · **Pri:** Must · **Src:** C

- **US-12.1** _Given_ an active episode, _when_ I save the assessment, _then_ version 1 is stored with my name and time.
- **US-12.2** _Given_ I edit a saved assessment, _then_ a new version is created and the earlier one stays viewable.
- **US-12.3** _Given_ I am a receptionist with read access only, _then_ I see the assessment but cannot edit it.
- **US-12.4** _Given_ I lack clinical view permission, _then_ the assessment is not shown.
- **US-12.5** _Given_ an assessment is viewed, _then_ an audit entry records the viewer.

### US-13 — Write a treatment plan

_As a_ physiotherapist, _I want to_ set diagnosis, goals, sessions and frequency, therapy types, and estimated cost, _so that_ everyone knows the plan. **Req:** CLN-003 · **Rel:** R1 · **Pri:** Must · **Src:** C

- **US-13.1** _Given_ the fields, _when_ I save, _then_ plan version 1 is stored.
- **US-13.2** _Given_ I change the plan later, _then_ a new version is saved and history is kept.
- **US-13.3** _Given_ an estimated cost, _then_ it is shown as an estimate only and does not create a charge.
- **US-13.4** _Given_ free-text exercise instructions, _then_ they can be added to the plan notes. No exercise library exists.
- **US-13.5** _Given_ planned sessions is 10 and the 11th visit is marked, _then_ a notice says the plan is exceeded and the visit is allowed.

### US-24 — Discharge a patient

_As a_ physiotherapist, _I want to_ mark a patient discharged, _so that_ finished cases leave the active list. **Req:** CLN-004 · **Rel:** R1 · **Pri:** Must · **Src:** C

- **US-24.1** _Given_ an active episode, _when_ I confirm discharge with an optional note, _then_ the episode and patient show as discharged and appear on the inactive list.
- **US-24.2** _Given_ the patient has dues, _when_ I discharge, _then_ the amount is shown and the discharge still completes.
- **US-24.3** _Given_ the patient has advance credit, _then_ a prompt suggests refund or keep as credit.
- **US-24.4** _Given_ I lack the discharge permission, _then_ the action is not shown.

### US-25 — Start a new episode for a returning patient

_As a_ physiotherapist, _I want to_ start a new episode, _so that_ each course of treatment stays separate. **Req:** CLN-001 · **Rel:** R1 · **Pri:** Must · **Src:** C

- **US-25.1** _Given_ a discharged patient, _when_ I start a new episode, _then_ the patient becomes active with an empty assessment and plan.
- **US-25.2** _Given_ earlier episodes, _then_ they remain viewable and unchanged.
- **US-25.3** _Given_ a patient with an active episode, _then_ I cannot start a second one.
- **US-25.4** _Given_ the ledger balance, _then_ it carries into the new episode.
- **US-25.5** _Given_ attendance is marked for a patient with no active episode, _then_ the app asks to start one first.

---

## Epic 5 — Visits

### US-14 — Mark attendance

_As a_ receptionist or therapist, _I want to_ mark a patient present, _so that_ the session is counted and charged. **Req:** VIS-001 · **Rel:** R1 · **Pri:** Must · **Src:** C
**Preconditions:** I hold "mark attendance"; the patient has an active episode.

- **US-14.1** _Given_ a default fee of ₹500, _when_ I mark attendance, _then_ a visit is created at my branch with fee ₹500 and a ₹500 charge appears in the ledger.
- **US-14.2** _Given_ the owner later changes the default to ₹600, _then_ the earlier visit still shows ₹500.
- **US-14.3** _Given_ the patient owes ₹1,500, _then_ a visible warning with ₹1,500 appears and the visit is allowed.
- **US-14.4** _Given_ the patient already has a visit today, _when_ I mark another, _then_ I must confirm.
- **US-14.5** _Given_ I am assigned to branch X, _then_ the visit is always recorded at branch X.
- **US-14.6** _Given_ the visit is saved, _then_ the session count and plan progress update.
- **US-14.7** _Given_ the connection is lost, _when_ I save, _then_ the app shows failure and does not claim success.
- **US-14.8** _Given_ I tap "save" twice quickly, _then_ only one visit is created.
- **US-14.9** _Given_ the visits list for today, _then_ it shows patient, time, therapist, and payment status for my branch.

### US-15 — Add a session note

_As a_ physiotherapist, _I want to_ add a short note to a visit, _so that_ I remember what was done. **Req:** VIS-002 · **Rel:** R1 · **Pri:** Must · **Src:** C

- **US-15.1** _Given_ a visit, _when_ I save a note, _then_ it stores my name and time.
- **US-15.2** _Given_ I edit a note, _then_ a new version is saved and the old one stays.
- **US-15.3** _Given_ no note, _then_ the visit remains valid. Notes are optional.
- **US-15.4** _Given_ a receptionist with read-only access, _then_ they can read but not change notes.

### US-15a — See a patient's visit history

_As staff, I want to_ see all visits of a patient, _so that_ I know what happened and where. **Req:** VIS-003 · **Rel:** R1 · **Pri:** Must · **Src:** C

- **US-15a.1** _Given_ several episodes and branches, _then_ visits are listed newest first with episode, branch, therapist, fee, and note indicator.
- **US-15a.2** _Given_ a reversed visit, _then_ it is shown as reversed with the reason, not hidden.

---

## Epic 6 — Billing and payments

### US-19 — Set and override the session fee

_As an_ owner, _I want to_ set the default fee and override it with a reason, _so that_ I can give discounts with a record. **Req:** BILL-001 · **Rel:** R1 · **Pri:** Must · **Src:** C

- **US-19.1** _Given_ I set a default fee, _then_ it applies to visits marked from then on.
- **US-19.2** _Given_ a user without the override permission, _then_ the fee field is read-only on a visit.
- **US-19.3** _Given_ a user with the permission enters a different fee, _then_ a reason is required and both are stored.
- **US-19.4** _Given_ a zero fee, _then_ a reason is required and a ₹0 charge is still created (DD-2).
- **US-19.5** _Given_ a negative or non-numeric fee, _then_ it is rejected.
- **US-19.6** _Given_ a patient-level fee is set (Rec), _then_ it applies to that patient's future visits until changed.

### US-17 — Record a payment

_As a_ receptionist, _I want to_ record a payment by cash, UPI, card, or bank transfer, _so that_ the balance is correct. **Req:** BILL-003 · **Rel:** R1 · **Pri:** Must · **Src:** C

- **US-17.1** _Given_ a patient with ₹1,500 dues, _when_ I record ₹1,500 cash, _then_ the balance becomes zero and a receipt is generated.
- **US-17.2** _Given_ a payment smaller than dues, _then_ the balance shows the remaining dues.
- **US-17.3** _Given_ amount zero or negative, _then_ the payment is rejected.
- **US-17.4** _Given_ UPI or bank transfer, _then_ a reference can be entered (required for bank transfer, Rec).
- **US-17.5** _Given_ the payment is saved, _then_ the entry carries my branch, my name, and the time.
- **US-17.6** _Given_ a double tap or a retry after a network error, _then_ one payment is created, not two.
- **US-17.7** _Given_ I lack "record payment", _then_ the action is not shown.

### US-18 — Accept an advance

_As a_ receptionist, _I want to_ accept payment ahead of sessions, _so that_ the patient's credit is tracked. **Req:** BILL-002, BILL-003 · **Rel:** R1 · **Pri:** Must · **Src:** C (Q16)

- **US-18.1** _Given_ a patient with no dues, _when_ I record ₹2,500, _then_ the balance shows ₹2,500 advance credit.
- **US-18.2** _Given_ three visits of ₹500 are then marked, _then_ the credit reduces to ₹1,000 with no extra action.
- **US-18.3** _Given_ credit is available, _then_ the system does not enforce when it must be used.
- **US-18.4** _Given_ the profile, _then_ it shows "advance credit" clearly and not as a negative number.

### US-20 — Refund or keep unused advance

_As an_ owner, _I want to_ refund unused advance or keep it as credit, _so that_ stopped treatment is handled fairly. **Req:** BILL-004 · **Rel:** R1 · **Pri:** Must · **Src:** C

- **US-20.1** _Given_ ₹1,000 advance credit, _when_ an authorised user refunds ₹1,000 with method and reason, _then_ a refund entry is added and credit becomes zero.
- **US-20.2** _Given_ a refund larger than the credit, _then_ it is rejected.
- **US-20.3** _Given_ a user without "process refund", _then_ the refund action is not shown.
- **US-20.4** _Given_ the credit is kept, _then_ nothing changes and it stays available for later visits.
- **US-20.5** _Given_ any refund, _then_ an audit entry and a document are created.

### US-21 — Correct a mistake by reversal

_As staff with permission, I want to_ reverse a wrong attendance or payment, _so that_ mistakes are fixed without losing the trail. **Req:** BILL-005 · **Rel:** R1 · **Pri:** Must · **Src:** C

- **US-21.1** _Given_ a wrong attendance, _when_ I reverse it with a reason, _then_ a reversal offsets its charge, the original stays visible, and the session count drops by one.
- **US-21.2** _Given_ a wrong payment, _when_ I reverse it, _then_ the balance returns to before the payment and a reversal receipt is issued.
- **US-21.3** _Given_ an entry already reversed, _then_ a second reversal is refused.
- **US-21.4** _Given_ a reversal entry, _then_ it cannot itself be reversed. Re-enter the correct entry instead.
- **US-21.5** _Given_ a reversal, _then_ the reason is mandatory and the user and time are stored.
- **US-21.6** _Given_ a same-day mistake, _then_ it also needs a reversal. There is no edit window (C, Q25 option C).
- **US-21.7** _Given_ the payment was partly refunded, _then_ the reversal is refused with an explanation (Rec).

### US-22 — Issue a numbered receipt

_As a_ receptionist, _I want to_ print or save a numbered receipt, _so that_ the patient has proof of payment. **Req:** BILL-006 · **Rel:** R1 · **Pri:** Must · **Src:** C

- **US-22.1** _Given_ a payment, _then_ a receipt shows clinic details, patient, amount, date, method, branch, number, and balance after payment.
- **US-22.2** _Given_ two receipts issued at the same moment at one branch, _then_ the numbers are consecutive, with no duplicate and no gap.
- **US-22.3** _Given_ 1 April 2027, _when_ a receipt is issued, _then_ the number uses the `2027-28` series starting at `0001`.
- **US-22.4** _Given_ a failed save, _then_ no number is consumed.
- **US-22.5** _Given_ a reprint, _then_ the same number and content appear, marked "duplicate copy" (Rec).
- **US-22.6** _Given_ the receipt, _then_ it is available as PDF and for printing.

### US-23 — Generate an invoice on request

_As a_ receptionist, _I want to_ generate an invoice, _so that_ a patient can claim from an employer or insurer. **Req:** BILL-007 · **Rel:** R1 · **Pri:** Must · **Src:** C

- **US-23.1** _Given_ an episode or a date range, _then_ a PDF lists each session, its fee, discounts, payments, and the total.
- **US-23.2** _Given_ the invoice is issued, _then_ it has a number from the invoice series for that branch and year.
- **US-23.3** _Given_ a later reversal, _then_ the issued invoice does not change; a new invoice can be issued.
- **US-23.4** _Given_ the invoice, _then_ it is not a GST tax invoice and does not claim to be.

### US-16 — See a warning when a patient owes money

_As a_ receptionist, _I want to_ see dues clearly, _so that_ I can ask for payment without refusing care. **Req:** BILL-008 · **Rel:** R1 · **Pri:** Must · **Src:** C

- **US-16.1** _Given_ the patient has dues, _when_ I open them or mark attendance, _then_ a visible banner shows the amount.
- **US-16.2** _Given_ dues, _then_ the visit can still be marked.
- **US-16.3** _Given_ dues arose at another branch, _then_ they are included.
- **US-16.4** _Given_ advance credit, _then_ no warning appears and the credit is shown instead.

---

## Epic 7 — Oversight and reporting

### US-26 — Daily view for the owner

_As an_ owner, _I want to_ see today's patients, collections, and dues, _so that_ I know how the day is going. **Req:** REP-001 · **Rel:** R1 (may move to R2) · **Pri:** Should · **Src:** C

- **US-26.1** _Given_ 12 visits and ₹6,000 in payments today, _then_ the dashboard shows 12 patients seen and ₹6,000 collected.
- **US-26.2** _Given_ a payment reversed today, _then_ collections show the net figure.
- **US-26.3** _Given_ I own several branches, _then_ I can see all together or filter by branch.
- **US-26.4** _Given_ I am a receptionist or therapist without report permission, _then_ the dashboard is not available.

### US-27 — Revenue and dues reports

_As an_ owner, _I want to_ see revenue by day, week, month, branch, and payment method, plus dues by patient, _so that_ I understand my business. **Req:** REP-002 · **Rel:** R2 · **Pri:** Should · **Src:** C

- **US-27.1** _Given_ a date range, _then_ report totals equal the sum of the ledger entries in the range.
- **US-27.2** _Given_ the report, _then_ it states whether it shows collections (payments) or charges (sessions).
- **US-27.3** _Given_ refunds and reversals, _then_ they are shown separately and netted in the total.
- **US-27.4** _Given_ the outstanding report, _then_ patients are sorted by amount due with last visit and branch.
- **US-27.5** _Given_ a branch filter, _then_ only that branch's entries count.

### US-28 — Export reports

_As an_ owner, _I want to_ export reports to Excel or PDF, _so that_ I can share them with my accountant. **Req:** REP-003 · **Rel:** R2 · **Pri:** Should · **Src:** C

- **US-28.1** _Given_ a report on screen, _when_ I export, _then_ the file matches the on-screen figures and filters.
- **US-28.2** _Given_ an export, _then_ an audit entry is recorded.
- **US-28.3** _Given_ I lack the export permission, _then_ the option is not shown.

### US-31 — Review activity

_As an_ owner, _I want to_ see who viewed or changed what, _so that_ I can check misuse. **Req:** AUD-001 · **Rel:** R1 · **Pri:** Must · **Src:** C

- **US-31.1** _Given_ any logged event, _then_ an entry holds user, time, branch, action, and target.
- **US-31.2** _Given_ the audit viewer, _then_ I can filter by user, patient, action, and date.
- **US-31.3** _Given_ any user, including the owner, _then_ nobody can edit or delete an audit entry through the application.
- **US-31.4** _Given_ a patient record view, _then_ it appears in the log.
- **US-31.5** _Given_ a role permission change, _then_ it appears with before and after.

### US-32 — Spot patients who stopped coming

_As an_ owner, _I want to_ see patients with no recent visit, _so that_ I can follow up by phone. **Req:** INA-001 · **Rel:** R2 · **Pri:** Should · **Src:** C

- **US-32.1** _Given_ an active episode with no visit in 30 days (default), _then_ the patient appears on the list.
- **US-32.2** _Given_ I change the number of days, _then_ the list updates.
- **US-32.3** _Given_ a discharged patient, _then_ they are not flagged.
- **US-32.4** _Given_ the list, _then_ it shows phone, last visit, and dues.

---

## Epic 8 — Data in and out (R2)

### US-29 — Import my patient list

_As an_ owner, _I want to_ import patients from Excel, _so that_ I move off spreadsheets quickly. **Req:** IMP-001 · **Rel:** R2 · **Pri:** Should · **Src:** C (details: Rec, OQ-4)

- **US-29.1** _Given_ the template, _then_ it lists the mandatory columns: name, phone, age, gender.
- **US-29.2** _Given_ a file of 200 rows where 5 lack gender, _when_ previewed, _then_ the 5 are listed with errors and the other 195 can be imported.
- **US-29.3** _Given_ a row whose phone and name match an existing patient, _then_ it is flagged as a duplicate and skipped by default.
- **US-29.4** _Given_ the import finishes, _then_ a result report shows created, skipped, and failed counts.
- **US-29.5** _Given_ I choose "roll back", _then_ all patients created by that import are removed from active use, with a log entry.
- **US-29.6** _Given_ an opening balance column (Rec), _then_ it creates one dated opening-balance entry per patient.
- **US-29.7** _Given_ a file with an unsupported format or over the size limit, _then_ it is rejected before processing.

### US-30 — Download my clinic's data

_As an_ owner, _I want to_ export patients, visits, and payments, _so that_ I own my data. **Req:** EXP-001 · **Rel:** R2 · **Pri:** Should · **Src:** C

- **US-30.1** _Given_ I choose the data and date range, _then_ I receive an Excel file.
- **US-30.2** _Given_ the export includes sensitive data, _then_ only the owner can run it and it is audit-logged.
- **US-30.3** _Given_ a suspended clinic (Rec, OQ-11), _then_ export remains available.

---

## Epic 9 — Platform administration (R2)

### US-33 — Manage clinics on the platform

_As a_ super-admin, _I want to_ list, suspend, and reactivate clinics and see their plan, _so that_ I can run the service. **Req:** ADM-001, SUB-001 · **Rel:** R2 · **Pri:** Should · **Src:** C

- **US-33.1** _Given_ the clinic list, _then_ each shows status, plan, trial end, and counts of branches, users, and patients.
- **US-33.2** _Given_ I suspend a clinic, _then_ its users see the behaviour defined by OQ-11.
- **US-33.3** _Given_ a plan with a limit of 2 branches, _when_ the owner adds a third, _then_ they are refused with a message.
- **US-33.4** _Given_ I change a plan's limits or feature flags, _then_ the change applies without a code release.
- **US-33.5** _Given_ I am a super-admin, _then_ I cannot see a clinic's patient or financial records by default (Rec, OQ-10).
- **US-33.6** _Given_ any super-admin action, _then_ a platform audit entry is recorded.

---

## Cross-cutting scenarios

These apply to every story and are tested once as a set.

- **XC-01 Tenant isolation.** _Given_ two clinics, _when_ a user of clinic A requests any record id of clinic B, _then_ the answer is "not found".
- **XC-02 Permission enforced on the server.** _Given_ a user without a permission, _when_ they call the action directly (not through the screen), _then_ it is refused.
- **XC-03 Online only.** _Given_ no connection, _then_ data entry is blocked with a clear message, and no unsaved action appears saved.
- **XC-04 No hard deletes.** _Given_ any clinical or financial record, _then_ no screen or call deletes it.
- **XC-05 Money precision.** _Given_ amounts with two decimals, _then_ totals never show rounding errors.
- **XC-06 Time.** _Given_ an entry made at 23:50 India time, _then_ it belongs to that day, and reports agree.
- **XC-07 Responsive.** _Given_ a phone, a tablet, and a desktop, _then_ each core flow (search, register, attendance, payment) can be completed.
- **XC-08 Installable.** _Given_ a supported browser, _then_ the app can be installed and opens full screen.
- **XC-09 Audit.** _Given_ any sensitive action in section 9.11 of the PRD, _then_ an audit entry exists.
- **XC-10 Validation messages.** _Given_ invalid input anywhere, _then_ the message names the field and the fix.

## Story index

| Epic                        | Stories                                                |
| --------------------------- | ------------------------------------------------------ |
| 1 Authentication and access | US-01, US-02, US-03, US-03a                            |
| 2 Clinics, branches, staff  | US-04, US-04a, US-05, US-06, US-07                     |
| 3 Patients                  | US-08, US-09, US-10, US-11, US-11a                     |
| 4 Clinical records          | US-12, US-13, US-24, US-25                             |
| 5 Visits                    | US-14, US-15, US-15a                                   |
| 6 Billing and payments      | US-19, US-17, US-18, US-20, US-21, US-22, US-23, US-16 |
| 7 Oversight and reporting   | US-26, US-27, US-28, US-31, US-32                      |
| 8 Data in and out           | US-29, US-30                                           |
| 9 Platform administration   | US-33                                                  |
