# CLAUDE.md: client

React PWA for the physiotherapy clinic product. Read `../docs/PRD.md` (requirements), `../docs/API-Requirements.md`
(the contract with the server) and `../docs/User-Stories.md` (acceptance criteria) before building a feature.
Requirement IDs (`PAT-001`, `BILL-003`, ...) in those files are the source of truth; cite them in commits and tests.

## Commands

```bash
npm run dev        # Vite on :5173, /api proxied to the Express server on :4000 (run it from ../server)
npm test           # Vitest (money, password strength)
npm run typecheck  # tsc -b
npm run lint       # oxlint; warnings inside src/components/ui/ are expected (generated shadcn files)
npm run build      # tsc -b && vite build, also generates the service worker
npm run generate-pwa-assets   # PNG icons from public/favicon.svg
```

Run typecheck, lint, test and build before saying a change is done.

## Stack

Vite 8 · React 19 · TypeScript 6 (strict, `noUncheckedIndexedAccess`, `erasableSyntaxOnly`) · Tailwind v4 ·
shadcn/ui on **Base UI** (style `base-nova`) · React Router · TanStack Query · React Hook Form · vite-plugin-pwa.

## Layout

- `src/api/` is the only code that knows about the backend: `types.ts` (the `Api` contract), `http.ts` (axios client for
  `/api/v1`: cookies, CSRF header, error mapping, session-expiry event), `errors.ts`. Screens import from `@/api`, never `http`.
  There is no mock: every screen talks to the real server.
- `src/components/auth/` sign-in building blocks (split `AuthLayout`, `PasswordInput`, `OtpInput`, `PasswordStrength`,
  `VerifyCodeStep`, `SetPasswordScreen` for reset and invitation links).
- `src/pages/settings/` owner settings (Clinic, Branches, Staff, Roles), linked from the sidebar's Settings section by permission.
  Shared pieces: `ConfirmDialog`, `EmptyState`, `Avatar`, `Switch` in `components/common`; `applyFieldErrors` in `lib/forms.ts`
  maps server 422 field errors onto react-hook-form.
- `src/branchScope/` the top-bar branch choice (`useBranchScope`: `branchId` or null for all branches, remembered per user in localStorage). Lists pass `branchId` to the API; `components/layout/BranchSelect.tsx` is the dropdown. Visits, payments and the dashboard should follow it too.
- **Routes:** `/` is only a redirect (`pages/LandingRedirect.tsx`): anyone with `report.view` (the owner) lands on `/dashboard`, everyone else on `/patients`. The patient list lives at `/patients` (`HomePage`), with `/patients/new` and `/patients/:id` under it; the sidebar lists Dashboard first, then Patients. Link to `/patients`, not `/`, when you mean the list.
- `src/features/patients/` patient list (`PatientTable`, `PatientFilterBar`, `patientFilters.ts` keeps search, filters and page in the address bar), register/edit forms, profile tabs. `components/common/Pagination.tsx` is reusable.
- `src/features/clinical/` the profile's Treatment tab (CLN-001 to CLN-004): `TreatmentTab` (episode picker, summary with
  `ProgressMeter`, assessment and plan cards), `AssessmentDialog` (with the 0–10 `PainScale`), `PlanDialog` (frequency and
  therapy chips), `VersionHistoryDialog`, `DischargeDialog`, `StartEpisodeButton` (owners pick a branch, pre-set from the
  branch scope; reused by `MarkAttendanceDialog`). Pure form rules in `clinicalForm.ts`. Each save is a new version; the
  server answers the unchanged version when nothing changed, so compare version numbers to tell the user. Opening an
  episode or a history is audited, so those queries use `staleTime` and never refetch on focus.
- `src/features/visits/` and `src/features/billing/` (VIS-001 to VIS-003, BILL-001 to BILL-008): `TodayVisits` (home), `MarkAttendanceDialog` (the "earlier day" date and reason appear only with `visit.backdate`), `VisitsTab`, `SessionNoteDialog`, bulk attendance for the owner (`BulkDaysDialog`: many days for one patient, from the Visits tab; `BulkPatientsDialog`: many patients for one day, from the home page; `DayPicker`, `useBulkMarking`, `lib/calendar.ts`; both need `visit.bulk`, and `visit.backdate` for earlier days); `RecordPaymentDialog`, `PaymentsTab` (ledger, receipts, invoices), `RefundDialog`, `InvoiceDialog`, `ReverseDialog` (one dialog for visits and ledger entries), `MethodPicker`, `DefaultFeeCard` (in Clinic settings). Receipts and invoices open as PDFs in a new tab (`api.documents.pdfUrl`); printing is the PDF viewer's. Every money write uses `useIdempotencyKey` and `invalidatePatientData`. The ledger and note queries are audited on the server, so they use `staleTime` and skip refetch on focus.
- `src/features/audit/` and `src/pages/AuditLogPage.tsx` (AUD-001): the owner's audit log at `/audit-log`, its own "Audit" section in the sidebar (needs `audit.view`). `auditFilters.ts` keeps person, patient, activity group, date range and page in the address bar (ids only, never names) and builds the deep links `auditLinkForPatient` / `auditLinkForUser`, used by "View activity" on the patient profile and in the staff row menu. The branch filter is the top-bar scope. `auditSummary.ts` is the pure wording: action labels and pill tones, a one-line summary per action (it names changed fields but never shows phone numbers or addresses), and the before/after rows for `AuditDetailDialog`. `PatientPicker` uses the ordinary patient search, never `api.patients.get`, because opening a patient is itself audited. Unknown server actions fall back to their raw key. The person select needs `staff.manage` (the staff list), so it is left out without it. Names for ids in the address come from the entries on screen.
- `src/features/dashboard/` and `src/pages/DashboardPage.tsx` (REP-001, US-26): the owner's "how is the day going" page at `/dashboard` (needs `report.view`). A KPI row of `StatTile`s with one hero figure (Collected today, net of reversals and refunds, with the received/reversed/refunded small print from `dashboardText.ts`), patients seen (sessions and new patients as notes) and outstanding dues (danger colour only when someone owes, always with icon and wording). Below: collected by method, a by-branch table (only across branches; a branch name switches the top-bar scope to it) and the five largest dues linking to the patient. It follows the top-bar branch, refetches every minute and has a refresh button; reading it is not audited. Big numbers use proportional digits, tables use `tabular-nums`. `invalidatePatientData` also invalidates `['dashboard']`, so a payment or visit made elsewhere refreshes it. No charts on purpose: trends and period totals are REP-002 (R2).
- `src/auth/` session context, hooks (`useUser`, `useCan`), route guards (`RequireAuth`, `RequirePermission`, `Can`).
- `src/features/<area>/` dialogs and tabs for one area. `src/pages/` one file per route. `src/components/{ui,layout,common}/`.
- `src/lib/` money, date (India time), query keys. `src/strings/en.ts` all UI text.

## Rules

- **Money is a string with two decimals** (`"500.00"`). Do arithmetic only in integer paise via `lib/money.ts`. Never use floats.
- **All UI text goes in `src/strings/en.ts`.** English only for the MVP, but keep text out of components.
- **Permissions are UI hints.** Hide actions with `useCan` or `<Can>`; the server enforces every one again. Permission keys
  are the `PermissionKey` union (see API doc section 4).
- **Online only.** Disable saving with `useOnlineStatus` and show `t.offline.blocked`. Never imply a save worked when it did not.
- **Idempotency.** Attendance and payments send an `Idempotency-Key`; keep the same key after a `NETWORK` error, regenerate it
  after any other error (see `MarkAttendanceDialog`).
- **No delete actions** for clinical or financial data. Corrections are reversals (`ReverseDialog`); a reversed visit or entry stays listed and marked.
- Dates and "today" use India time (`lib/date.ts`). Financial year is April to March.
- Match the receptionist's pace: big tap targets (`h-10`), minimal typing, dialogs reset on every open.
- Reference design: grey frame, left sidebar, white content panel, blue primary, breadcrumb page header, underlined tabs,
  bordered cards (`SectionCard`), soft pills (`SoftPill`). Reuse these instead of inventing new patterns.

## Gotchas

- `erasableSyntaxOnly` is on: no `enum`, no constructor parameter properties, no `namespace`. Declare class fields explicitly.
- shadcn here is Base UI, not Radix. Use `render`, not `asChild`. For link-styled buttons use
  `<Link className={buttonVariants({...})}>`, not `<Button render={<Link/>}>`. `DropdownMenuLabel` must sit inside a
  `DropdownMenuGroup`. For simple dropdowns prefer a native `<select>` (`selectClassName` in `common/Field.tsx`).
- The shadcn `cn` helper comes from the `cn` package (`src/lib/utils.ts` re-exports it). That is shadcn's own package; keep it.
- `@hookform/resolvers` is deliberately not installed (peer-dependency conflict). Validate with React Hook Form rules or zod.
- Add components with `npx shadcn@latest add <name>`; do not hand-copy them.
- Tests pin the time zone to `Asia/Kolkata` in `vitest.config.ts` (date helpers assume India time).
- Sessions are httpOnly cookies set by the server; the CSRF token is kept in memory in `http.ts` and refreshed by `/auth/me`
  on load. Never store tokens in `localStorage`. A 401 `UNAUTHENTICATED` outside the auth flow fires `onSessionExpired`.
- The service worker caches the app shell only. Never add runtime caching for `/api/` (patient data must not be cached).
- The default receptionist cannot start an episode (PRD matrix). Open decision; do not silently change the permission.

## Not built yet

Owner view of a staff member's trusted devices, reports, import/export, back-dated payments (the server accepts an owner-only `date`; the dialog has no field for it yet). Build on the `dev` branch via a feature branch.
