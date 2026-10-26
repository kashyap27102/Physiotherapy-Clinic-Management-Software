# User Stories and Acceptance Criteria

| | |
|---|---|
| **Version** | 1.0 |
| **Date** | 2026-10-26 |
| **Based on** | [PRD.md](PRD.md) v1.0 sections 9 to 13 |
| **Format** | Story, requirement link, preconditions, acceptance criteria in Given / When / Then |

**How to use:** each story has an ID (`US-nn`) matching the PRD. Each criterion has a scenario ID (`US-nn.k`) that QA and developers can cite. A story is done when all its scenarios pass.

**Source tags:** **C** confirmed by the product owner; **Rec** recommended, awaiting approval; **A** assumption.

**Default role names:** Owner, Receptionist, Physiotherapist, Super-admin. "Authorised" means the user's role holds the needed permission, which the Owner controls.

---

## Epic 1 — Authentication and access

### US-01 — Sign in with email and password
*As a* user, *I want to* sign in with my email and password, *so that* I can reach my clinic's data. **Req:** AUTH-001 · **Rel:** R1 · **Pri:** Must · **Src:** C
**Preconditions:** the account exists, is active, and its clinic is active.
- **US-01.1** *Given* correct credentials on a trusted device, *when* I submit, *then* I land on my home screen (receptionist home, or owner dashboard).
- **US-01.2** *Given* a wrong password or unknown email, *when* I submit, *then* I see the same generic error either way.
- **US-01.3** *Given* five failed attempts in a row, *when* I try again during the lock period, *then* I am refused even with the right password, and the message says to try later. *(Rec: 5 attempts, 15 minutes.)*
- **US-01.4** *Given* my account is deactivated, *when* I sign in, *then* I am refused with a message to contact my clinic owner.
- **US-01.5** *Given* my clinic is suspended, *when* I sign in, *then* I see the behaviour set by OQ-11.
- **US-01.6** *Given* I am signed in and idle past the session limit, *when* I act, *then* I am asked to sign in again and nothing is lost that was already saved.

### US-02 — Verify a new device with an email code
*As a* user, *I want to* enter a code emailed to me on a new device, *so that* my account is protected. **Req:** AUTH-002 · **Rel:** R1 · **Pri:** Must · **Src:** C
- **US-02.1** *Given* correct credentials on an unrecognised device, *when* I submit, *then* a 6-digit code is emailed and I am asked for it before a session starts.
- **US-02.2** *Given* the correct code within 10 minutes, *when* I enter it, *then* I sign in.
- **US-02.3** *Given* a wrong or expired code, *when* I enter it, *then* access is refused. After 5 wrong attempts I must request a new code.
- **US-02.4** *Given* I tick "trust this device", *when* I sign in again within the trust period (Rec: 30 days), *then* no code is asked.
- **US-02.5** *Given* I request "resend", *when* I ask too often, *then* the request is rate limited.
- **US-02.6** *Given* a used code, *when* it is entered again, *then* it is rejected.

### US-03 — Review and revoke trusted devices
*As an* owner (or any user for my own devices), *I want to* see and revoke trusted devices, *so that* a lost or shared device cannot be used. **Req:** AUTH-003 · **Rel:** R1 · **Pri:** Must · **Src:** Rec
- **US-03.1** *Given* I open my trusted devices, *then* I see each device's label, last use, and expiry.
- **US-03.2** *Given* I revoke a device, *when* that device next signs in, *then* an OTP is required.
- **US-03.3** *Given* I am the owner, *when* I revoke a staff member's device, *then* the same applies and an audit entry is recorded.
- **US-03.4** *Given* I am a receptionist or therapist, *then* I cannot see other users' devices.

### US-03a — Reset or change my password
*As a* user, *I want to* reset a forgotten password or change my password, *so that* I keep access. **Req:** AUTH-004 · **Rel:** R1 · **Pri:** Must · **Src:** Rec
- **US-03a.1** *Given* I request a reset, *when* the email exists or not, *then* the message is the same ("if the account exists, an email was sent").
- **US-03a.2** *Given* a reset link, *when* I use it within its expiry, *then* I can set a new password once; reuse of the link fails.
- **US-03a.3** *Given* I set a password that is too weak, *then* the form rejects it with a reason.
- **US-03a.4** *Given* I change my password, *then* my other sessions end and the change is audit-logged.

---

## Epic 2 — Clinics, branches, and staff

### US-04 — Create a clinic
*As a* super-admin, *I want to* create a clinic and its owner, *so that* the clinic can start. **Req:** TEN-001 · **Rel:** R1 (minimal) · **Pri:** Must · **Src:** C
- **US-04.1** *Given* a clinic name and an owner email, *when* I create it, *then* the clinic exists with default permission templates, a default branch is prompted, and the owner receives an invitation email.
- **US-04.2** *Given* the owner email already belongs to a user, *when* I create, *then* it is refused (email unique across the platform, DD-1).
- **US-04.3** *Given* the owner opens the invitation, *when* they set a password, *then* they sign in (with OTP on first device) and see an empty clinic.
- **US-04.4** *Given* I am not a super-admin, *then* I cannot reach this function.

### US-04a — Maintain the clinic profile
*As an* owner, *I want to* set my clinic's name, address, phone, logo, and receipt details, *so that* receipts look right. **Req:** TEN-001 · **Rel:** R1 · **Pri:** Must · **Src:** C (A-4)
- **US-04a.1** *Given* I update the profile, *then* new receipts show the new details and old receipts are unchanged.
- **US-04a.2** *Given* a logo upload, *when* it is not an image or is too large, *then* it is rejected with a reason.

### US-05 — Manage branches
*As an* owner, *I want to* add and edit branches, *so that* each location's work and numbers are separate. **Req:** TEN-002 · **Rel:** R1 · **Pri:** Must · **Src:** C
- **US-05.1** *Given* a name, address, and a unique code, *when* I save, *then* the branch is created.
- **US-05.2** *Given* a branch has issued a receipt, *when* I try to change its code, *then* the change is refused.
- **US-05.3** *Given* a branch holds visits or payments, *when* I try to delete it, *then* I can only deactivate it.
- **US-05.4** *Given* the plan allows two branches, *when* I add a third, *then* I am refused with a clear message (R2, SUB-001).
- **US-05.5** *Given* I deactivate a branch with active staff, *then* I am asked to reassign them first.

### US-06 — Manage staff
*As an* owner, *I want to* add staff and assign each to one branch, *so that* the right people work in the right place. **Req:** USR-001 · **Rel:** R1 · **Pri:** Must · **Src:** C
- **US-06.1** *Given* name, email, role, and branch, *when* I save, *then* the staff member receives an invitation.
- **US-06.2** *Given* a receptionist or therapist, *then* exactly one branch is required.
- **US-06.3** *Given* I deactivate a staff member, *then* they can no longer sign in, and their past entries still show their name.
- **US-06.4** *Given* I am the only active owner, *when* I try to deactivate myself, *then* the action is blocked.
- **US-06.5** *Given* I move staff to another branch, *then* their old records keep the original branch tag and new work uses the new branch.
- **US-06.6** *Given* a receptionist or therapist, *then* they cannot reach staff management.

### US-07 — Set what each role can do
*As an* owner, *I want to* change the permissions of the Receptionist and Physiotherapist roles, *so that* I control access to sensitive data and money. **Req:** USR-002 · **Rel:** R1 · **Pri:** Must · **Src:** C
- **US-07.1** *Given* a new clinic, *then* both roles start with the default templates.
- **US-07.2** *Given* I remove "view clinical notes" from the Receptionist role, *when* a receptionist next opens a patient, *then* clinical sections are hidden.
- **US-07.3** *Given* I add "process refund" to a role, *then* users with that role see the refund action on their next request.
- **US-07.4** *Given* I would remove a permission that leaves nobody able to record payments, *then* I see a warning before saving.
- **US-07.5** *Given* any change, *then* an audit entry shows who changed what, with before and after.
- **US-07.6** *Given* the Owner role, *then* its permissions cannot be reduced.
- **US-07.7** *Given* I look for per-user overrides or custom roles, *then* they do not exist in the MVP.

---

## Epic 3 — Patients

### US-08 — Register a walk-in patient
*As a* receptionist, *I want to* register a patient with name, phone, age, and gender, *so that* they are in the system within seconds. **Req:** PAT-001 · **Rel:** R1 · **Pri:** Must · **Src:** C
**Preconditions:** I hold "register patient".
- **US-08.1** *Given* all four mandatory fields, *when* I save, *then* the patient is created with the registering branch.
- **US-08.2** *Given* a mandatory field is empty or invalid, *when* I save, *then* the form names the field and does not save.
- **US-08.3** *Given* another patient has the same phone, *when* I save, *then* I see the possible duplicate and can open it or create anyway.
- **US-08.4** *Given* I enter a date of birth instead of an age, *then* the age is derived (or the reverse).
- **US-08.5** *Given* the patient has no own phone, *when* I enter a guardian's number, *then* it is marked as a guardian contact.
- **US-08.6** *Given* a saved patient, *then* I can go directly to starting an episode or marking attendance.
- **US-08.7** *Given* the plan's patient limit is reached (R2), *then* I am refused with a clear message.

### US-09 — Find a patient quickly
*As a* receptionist, *I want to* search by name or phone, *so that* I find returning patients and avoid duplicates. **Req:** PAT-002 · **Rel:** R1 · **Pri:** Must · **Src:** C
- **US-09.1** *Given* part of a phone number (4 or more digits), *then* matching patients appear.
- **US-09.2** *Given* part of a name in any letter case, *then* matching patients appear.
- **US-09.3** *Given* results, *then* each shows name, phone, age, last visit date, last visit branch, and a dues indicator.
- **US-09.4** *Given* many matches, *then* results are paged and the most recent visitors come first.
- **US-09.5** *Given* no match, *then* a "Register new patient" shortcut is offered with the typed text pre-filled.

### US-10 — See the whole patient on one page
*As staff, I want to* open a patient profile, *so that* I see history, balance, and actions together. **Req:** PAT-003 · **Rel:** R1 · **Pri:** Must · **Src:** C (tabs: Rec)
- **US-10.1** *Given* a patient, *then* the header shows name, age, gender, phone, status, and the balance or advance credit.
- **US-10.2** *Given* the tabs Overview, Treatment, Visits, and Payments, *then* each shows its content according to my permissions.
- **US-10.3** *Given* I lack "view ledger", *then* the Payments tab and amounts are hidden.
- **US-10.4** *Given* a patient owes money, *then* the dues are shown prominently at the top.
- **US-10.5** *Given* the profile opens, *then* a "patient viewed" audit entry is recorded.
- **US-10.6** *Given* quick actions, *then* only those I am permitted to use are shown: mark attendance, record payment, discharge.

### US-11 — Open a patient from another branch
*As a* receptionist, *I want to* find a patient registered elsewhere, *so that* they do not register again. **Req:** PAT-005 · **Rel:** R1 · **Pri:** Must · **Src:** C
- **US-11.1** *Given* a patient registered at branch A, *when* I search at branch B, *then* I can open them with full history.
- **US-11.2** *Given* a visit at another branch, *then* it carries that branch's tag.
- **US-11.3** *Given* dues from another branch, *then* they are included in the balance and the warning.
- **US-11.4** *Given* a patient of a different clinic, *then* they never appear in my search.
- **US-11.5** *Given* I open a record from another branch, *then* the audit log shows the view.

### US-11a — Correct patient details
*As an* authorised user, *I want to* edit patient details, *so that* mistakes are fixed. **Req:** PAT-004 · **Rel:** R1 · **Pri:** Must · **Src:** Rec
- **US-11a.1** *Given* I change the phone number, *then* the audit entry holds the old and new values.
- **US-11a.2** *Given* the new phone matches another patient, *then* the duplicate notice appears.
- **US-11a.3** *Given* I lack the permission, *then* the fields are read-only.

---

## Epic 4 — Clinical records

### US-12 — Record the initial assessment
*As a* physiotherapist, *I want to* record history, pain, range of motion, and diagnosis, *so that* the patient's condition is documented. **Req:** CLN-002 · **Rel:** R1 · **Pri:** Must · **Src:** C
- **US-12.1** *Given* an active episode, *when* I save the assessment, *then* version 1 is stored with my name and time.
- **US-12.2** *Given* I edit a saved assessment, *then* a new version is created and the earlier one stays viewable.
- **US-12.3** *Given* I am a receptionist with read access only, *then* I see the assessment but cannot edit it.
- **US-12.4** *Given* I lack clinical view permission, *then* the assessment is not shown.
- **US-12.5** *Given* an assessment is viewed, *then* an audit entry records the viewer.

### US-13 — Write a treatment plan
*As a* physiotherapist, *I want to* set diagnosis, goals, sessions and frequency, therapy types, and estimated cost, *so that* everyone knows the plan. **Req:** CLN-003 · **Rel:** R1 · **Pri:** Must · **Src:** C
- **US-13.1** *Given* the fields, *when* I save, *then* plan version 1 is stored.
- **US-13.2** *Given* I change the plan later, *then* a new version is saved and history is kept.
- **US-13.3** *Given* an estimated cost, *then* it is shown as an estimate only and does not create a charge.
- **US-13.4** *Given* free-text exercise instructions, *then* they can be added to the plan notes. No exercise library exists.
- **US-13.5** *Given* planned sessions is 10 and the 11th visit is marked, *then* a notice says the plan is exceeded and the visit is allowed.

### US-24 — Discharge a patient
*As a* physiotherapist, *I want to* mark a patient discharged, *so that* finished cases leave the active list. **Req:** CLN-004 · **Rel:** R1 · **Pri:** Must · **Src:** C
- **US-24.1** *Given* an active episode, *when* I confirm discharge with an optional note, *then* the episode and patient show as discharged and appear on the inactive list.
- **US-24.2** *Given* the patient has dues, *when* I discharge, *then* the amount is shown and the discharge still completes.
- **US-24.3** *Given* the patient has advance credit, *then* a prompt suggests refund or keep as credit.
- **US-24.4** *Given* I lack the discharge permission, *then* the action is not shown.

### US-25 — Start a new episode for a returning patient
*As a* physiotherapist, *I want to* start a new episode, *so that* each course of treatment stays separate. **Req:** CLN-001 · **Rel:** R1 · **Pri:** Must · **Src:** C
- **US-25.1** *Given* a discharged patient, *when* I start a new episode, *then* the patient becomes active with an empty assessment and plan.
- **US-25.2** *Given* earlier episodes, *then* they remain viewable and unchanged.
- **US-25.3** *Given* a patient with an active episode, *then* I cannot start a second one.
- **US-25.4** *Given* the ledger balance, *then* it carries into the new episode.
- **US-25.5** *Given* attendance is marked for a patient with no active episode, *then* the app asks to start one first.

---

## Epic 5 — Visits

### US-14 — Mark attendance
*As a* receptionist or therapist, *I want to* mark a patient present, *so that* the session is counted and charged. **Req:** VIS-001 · **Rel:** R1 · **Pri:** Must · **Src:** C
**Preconditions:** I hold "mark attendance"; the patient has an active episode.
- **US-14.1** *Given* a default fee of ₹500, *when* I mark attendance, *then* a visit is created at my branch with fee ₹500 and a ₹500 charge appears in the ledger.
- **US-14.2** *Given* the owner later changes the default to ₹600, *then* the earlier visit still shows ₹500.
- **US-14.3** *Given* the patient owes ₹1,500, *then* a visible warning with ₹1,500 appears and the visit is allowed.
- **US-14.4** *Given* the patient already has a visit today, *when* I mark another, *then* I must confirm.
- **US-14.5** *Given* I am assigned to branch X, *then* the visit is always recorded at branch X.
- **US-14.6** *Given* the visit is saved, *then* the session count and plan progress update.
- **US-14.7** *Given* the connection is lost, *when* I save, *then* the app shows failure and does not claim success.
- **US-14.8** *Given* I tap "save" twice quickly, *then* only one visit is created.
- **US-14.9** *Given* the visits list for today, *then* it shows patient, time, therapist, and payment status for my branch.

### US-15 — Add a session note
*As a* physiotherapist, *I want to* add a short note to a visit, *so that* I remember what was done. **Req:** VIS-002 · **Rel:** R1 · **Pri:** Must · **Src:** C
- **US-15.1** *Given* a visit, *when* I save a note, *then* it stores my name and time.
- **US-15.2** *Given* I edit a note, *then* a new version is saved and the old one stays.
- **US-15.3** *Given* no note, *then* the visit remains valid. Notes are optional.
- **US-15.4** *Given* a receptionist with read-only access, *then* they can read but not change notes.

### US-15a — See a patient's visit history
*As staff, I want to* see all visits of a patient, *so that* I know what happened and where. **Req:** VIS-003 · **Rel:** R1 · **Pri:** Must · **Src:** C
- **US-15a.1** *Given* several episodes and branches, *then* visits are listed newest first with episode, branch, therapist, fee, and note indicator.
- **US-15a.2** *Given* a reversed visit, *then* it is shown as reversed with the reason, not hidden.

---

## Epic 6 — Billing and payments

### US-19 — Set and override the session fee
*As an* owner, *I want to* set the default fee and override it with a reason, *so that* I can give discounts with a record. **Req:** BILL-001 · **Rel:** R1 · **Pri:** Must · **Src:** C
- **US-19.1** *Given* I set a default fee, *then* it applies to visits marked from then on.
- **US-19.2** *Given* a user without the override permission, *then* the fee field is read-only on a visit.
- **US-19.3** *Given* a user with the permission enters a different fee, *then* a reason is required and both are stored.
- **US-19.4** *Given* a zero fee, *then* a reason is required and a ₹0 charge is still created (DD-2).
- **US-19.5** *Given* a negative or non-numeric fee, *then* it is rejected.
- **US-19.6** *Given* a patient-level fee is set (Rec), *then* it applies to that patient's future visits until changed.

### US-17 — Record a payment
*As a* receptionist, *I want to* record a payment by cash, UPI, card, or bank transfer, *so that* the balance is correct. **Req:** BILL-003 · **Rel:** R1 · **Pri:** Must · **Src:** C
- **US-17.1** *Given* a patient with ₹1,500 dues, *when* I record ₹1,500 cash, *then* the balance becomes zero and a receipt is generated.
- **US-17.2** *Given* a payment smaller than dues, *then* the balance shows the remaining dues.
- **US-17.3** *Given* amount zero or negative, *then* the payment is rejected.
- **US-17.4** *Given* UPI or bank transfer, *then* a reference can be entered (required for bank transfer, Rec).
- **US-17.5** *Given* the payment is saved, *then* the entry carries my branch, my name, and the time.
- **US-17.6** *Given* a double tap or a retry after a network error, *then* one payment is created, not two.
- **US-17.7** *Given* I lack "record payment", *then* the action is not shown.

### US-18 — Accept an advance
*As a* receptionist, *I want to* accept payment ahead of sessions, *so that* the patient's credit is tracked. **Req:** BILL-002, BILL-003 · **Rel:** R1 · **Pri:** Must · **Src:** C (Q16)
- **US-18.1** *Given* a patient with no dues, *when* I record ₹2,500, *then* the balance shows ₹2,500 advance credit.
- **US-18.2** *Given* three visits of ₹500 are then marked, *then* the credit reduces to ₹1,000 with no extra action.
- **US-18.3** *Given* credit is available, *then* the system does not enforce when it must be used.
- **US-18.4** *Given* the profile, *then* it shows "advance credit" clearly and not as a negative number.

### US-20 — Refund or keep unused advance
*As an* owner, *I want to* refund unused advance or keep it as credit, *so that* stopped treatment is handled fairly. **Req:** BILL-004 · **Rel:** R1 · **Pri:** Must · **Src:** C
- **US-20.1** *Given* ₹1,000 advance credit, *when* an authorised user refunds ₹1,000 with method and reason, *then* a refund entry is added and credit becomes zero.
- **US-20.2** *Given* a refund larger than the credit, *then* it is rejected.
- **US-20.3** *Given* a user without "process refund", *then* the refund action is not shown.
- **US-20.4** *Given* the credit is kept, *then* nothing changes and it stays available for later visits.
- **US-20.5** *Given* any refund, *then* an audit entry and a document are created.

### US-21 — Correct a mistake by reversal
*As staff with permission, I want to* reverse a wrong attendance or payment, *so that* mistakes are fixed without losing the trail. **Req:** BILL-005 · **Rel:** R1 · **Pri:** Must · **Src:** C
- **US-21.1** *Given* a wrong attendance, *when* I reverse it with a reason, *then* a reversal offsets its charge, the original stays visible, and the session count drops by one.
- **US-21.2** *Given* a wrong payment, *when* I reverse it, *then* the balance returns to before the payment and a reversal receipt is issued.
- **US-21.3** *Given* an entry already reversed, *then* a second reversal is refused.
- **US-21.4** *Given* a reversal entry, *then* it cannot itself be reversed. Re-enter the correct entry instead.
- **US-21.5** *Given* a reversal, *then* the reason is mandatory and the user and time are stored.
- **US-21.6** *Given* a same-day mistake, *then* it also needs a reversal. There is no edit window (C, Q25 option C).
- **US-21.7** *Given* the payment was partly refunded, *then* the reversal is refused with an explanation (Rec).

### US-22 — Issue a numbered receipt
*As a* receptionist, *I want to* print or save a numbered receipt, *so that* the patient has proof of payment. **Req:** BILL-006 · **Rel:** R1 · **Pri:** Must · **Src:** C
- **US-22.1** *Given* a payment, *then* a receipt shows clinic details, patient, amount, date, method, branch, number, and balance after payment.
- **US-22.2** *Given* two receipts issued at the same moment at one branch, *then* the numbers are consecutive, with no duplicate and no gap.
- **US-22.3** *Given* 1 April 2027, *when* a receipt is issued, *then* the number uses the `2027-28` series starting at `0001`.
- **US-22.4** *Given* a failed save, *then* no number is consumed.
- **US-22.5** *Given* a reprint, *then* the same number and content appear, marked "duplicate copy" (Rec).
- **US-22.6** *Given* the receipt, *then* it is available as PDF and for printing.

### US-23 — Generate an invoice on request
*As a* receptionist, *I want to* generate an invoice, *so that* a patient can claim from an employer or insurer. **Req:** BILL-007 · **Rel:** R1 · **Pri:** Must · **Src:** C
- **US-23.1** *Given* an episode or a date range, *then* a PDF lists each session, its fee, discounts, payments, and the total.
- **US-23.2** *Given* the invoice is issued, *then* it has a number from the invoice series for that branch and year.
- **US-23.3** *Given* a later reversal, *then* the issued invoice does not change; a new invoice can be issued.
- **US-23.4** *Given* the invoice, *then* it is not a GST tax invoice and does not claim to be.

### US-16 — See a warning when a patient owes money
*As a* receptionist, *I want to* see dues clearly, *so that* I can ask for payment without refusing care. **Req:** BILL-008 · **Rel:** R1 · **Pri:** Must · **Src:** C
- **US-16.1** *Given* the patient has dues, *when* I open them or mark attendance, *then* a visible banner shows the amount.
- **US-16.2** *Given* dues, *then* the visit can still be marked.
- **US-16.3** *Given* dues arose at another branch, *then* they are included.
- **US-16.4** *Given* advance credit, *then* no warning appears and the credit is shown instead.

---

## Epic 7 — Oversight and reporting

### US-26 — Daily view for the owner
*As an* owner, *I want to* see today's patients, collections, and dues, *so that* I know how the day is going. **Req:** REP-001 · **Rel:** R1 (may move to R2) · **Pri:** Should · **Src:** C
- **US-26.1** *Given* 12 visits and ₹6,000 in payments today, *then* the dashboard shows 12 patients seen and ₹6,000 collected.
- **US-26.2** *Given* a payment reversed today, *then* collections show the net figure.
- **US-26.3** *Given* I own several branches, *then* I can see all together or filter by branch.
- **US-26.4** *Given* I am a receptionist or therapist without report permission, *then* the dashboard is not available.

### US-27 — Revenue and dues reports
*As an* owner, *I want to* see revenue by day, week, month, branch, and payment method, plus dues by patient, *so that* I understand my business. **Req:** REP-002 · **Rel:** R2 · **Pri:** Should · **Src:** C
- **US-27.1** *Given* a date range, *then* report totals equal the sum of the ledger entries in the range.
- **US-27.2** *Given* the report, *then* it states whether it shows collections (payments) or charges (sessions).
- **US-27.3** *Given* refunds and reversals, *then* they are shown separately and netted in the total.
- **US-27.4** *Given* the outstanding report, *then* patients are sorted by amount due with last visit and branch.
- **US-27.5** *Given* a branch filter, *then* only that branch's entries count.

### US-28 — Export reports
*As an* owner, *I want to* export reports to Excel or PDF, *so that* I can share them with my accountant. **Req:** REP-003 · **Rel:** R2 · **Pri:** Should · **Src:** C
- **US-28.1** *Given* a report on screen, *when* I export, *then* the file matches the on-screen figures and filters.
- **US-28.2** *Given* an export, *then* an audit entry is recorded.
- **US-28.3** *Given* I lack the export permission, *then* the option is not shown.

### US-31 — Review activity
*As an* owner, *I want to* see who viewed or changed what, *so that* I can check misuse. **Req:** AUD-001 · **Rel:** R1 · **Pri:** Must · **Src:** C
- **US-31.1** *Given* any logged event, *then* an entry holds user, time, branch, action, and target.
- **US-31.2** *Given* the audit viewer, *then* I can filter by user, patient, action, and date.
- **US-31.3** *Given* any user, including the owner, *then* nobody can edit or delete an audit entry through the application.
- **US-31.4** *Given* a patient record view, *then* it appears in the log.
- **US-31.5** *Given* a role permission change, *then* it appears with before and after.

### US-32 — Spot patients who stopped coming
*As an* owner, *I want to* see patients with no recent visit, *so that* I can follow up by phone. **Req:** INA-001 · **Rel:** R2 · **Pri:** Should · **Src:** C
- **US-32.1** *Given* an active episode with no visit in 30 days (default), *then* the patient appears on the list.
- **US-32.2** *Given* I change the number of days, *then* the list updates.
- **US-32.3** *Given* a discharged patient, *then* they are not flagged.
- **US-32.4** *Given* the list, *then* it shows phone, last visit, and dues.

---

## Epic 8 — Data in and out (R2)

### US-29 — Import my patient list
*As an* owner, *I want to* import patients from Excel, *so that* I move off spreadsheets quickly. **Req:** IMP-001 · **Rel:** R2 · **Pri:** Should · **Src:** C (details: Rec, OQ-4)
- **US-29.1** *Given* the template, *then* it lists the mandatory columns: name, phone, age, gender.
- **US-29.2** *Given* a file of 200 rows where 5 lack gender, *when* previewed, *then* the 5 are listed with errors and the other 195 can be imported.
- **US-29.3** *Given* a row whose phone and name match an existing patient, *then* it is flagged as a duplicate and skipped by default.
- **US-29.4** *Given* the import finishes, *then* a result report shows created, skipped, and failed counts.
- **US-29.5** *Given* I choose "roll back", *then* all patients created by that import are removed from active use, with a log entry.
- **US-29.6** *Given* an opening balance column (Rec), *then* it creates one dated opening-balance entry per patient.
- **US-29.7** *Given* a file with an unsupported format or over the size limit, *then* it is rejected before processing.

### US-30 — Download my clinic's data
*As an* owner, *I want to* export patients, visits, and payments, *so that* I own my data. **Req:** EXP-001 · **Rel:** R2 · **Pri:** Should · **Src:** C
- **US-30.1** *Given* I choose the data and date range, *then* I receive an Excel file.
- **US-30.2** *Given* the export includes sensitive data, *then* only the owner can run it and it is audit-logged.
- **US-30.3** *Given* a suspended clinic (Rec, OQ-11), *then* export remains available.

---

## Epic 9 — Platform administration (R2)

### US-33 — Manage clinics on the platform
*As a* super-admin, *I want to* list, suspend, and reactivate clinics and see their plan, *so that* I can run the service. **Req:** ADM-001, SUB-001 · **Rel:** R2 · **Pri:** Should · **Src:** C
- **US-33.1** *Given* the clinic list, *then* each shows status, plan, trial end, and counts of branches, users, and patients.
- **US-33.2** *Given* I suspend a clinic, *then* its users see the behaviour defined by OQ-11.
- **US-33.3** *Given* a plan with a limit of 2 branches, *when* the owner adds a third, *then* they are refused with a message.
- **US-33.4** *Given* I change a plan's limits or feature flags, *then* the change applies without a code release.
- **US-33.5** *Given* I am a super-admin, *then* I cannot see a clinic's patient or financial records by default (Rec, OQ-10).
- **US-33.6** *Given* any super-admin action, *then* a platform audit entry is recorded.

---

## Cross-cutting scenarios

These apply to every story and are tested once as a set.

- **XC-01 Tenant isolation.** *Given* two clinics, *when* a user of clinic A requests any record id of clinic B, *then* the answer is "not found".
- **XC-02 Permission enforced on the server.** *Given* a user without a permission, *when* they call the action directly (not through the screen), *then* it is refused.
- **XC-03 Online only.** *Given* no connection, *then* data entry is blocked with a clear message, and no unsaved action appears saved.
- **XC-04 No hard deletes.** *Given* any clinical or financial record, *then* no screen or call deletes it.
- **XC-05 Money precision.** *Given* amounts with two decimals, *then* totals never show rounding errors.
- **XC-06 Time.** *Given* an entry made at 23:50 India time, *then* it belongs to that day, and reports agree.
- **XC-07 Responsive.** *Given* a phone, a tablet, and a desktop, *then* each core flow (search, register, attendance, payment) can be completed.
- **XC-08 Installable.** *Given* a supported browser, *then* the app can be installed and opens full screen.
- **XC-09 Audit.** *Given* any sensitive action in section 9.11 of the PRD, *then* an audit entry exists.
- **XC-10 Validation messages.** *Given* invalid input anywhere, *then* the message names the field and the fix.

## Story index

| Epic | Stories |
|---|---|
| 1 Authentication and access | US-01, US-02, US-03, US-03a |
| 2 Clinics, branches, staff | US-04, US-04a, US-05, US-06, US-07 |
| 3 Patients | US-08, US-09, US-10, US-11, US-11a |
| 4 Clinical records | US-12, US-13, US-24, US-25 |
| 5 Visits | US-14, US-15, US-15a |
| 6 Billing and payments | US-19, US-17, US-18, US-20, US-21, US-22, US-23, US-16 |
| 7 Oversight and reporting | US-26, US-27, US-28, US-31, US-32 |
| 8 Data in and out | US-29, US-30 |
| 9 Platform administration | US-33 |
