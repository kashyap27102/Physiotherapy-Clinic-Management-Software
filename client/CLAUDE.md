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
- `src/features/patients/` patient list (`PatientTable`, `PatientFilterBar`, `patientFilters.ts` keeps search, filters and page in the address bar), register/edit forms, profile tabs. `components/common/Pagination.tsx` is reusable.
- `src/features/clinical/` the profile's Treatment tab (CLN-001 to CLN-004): `TreatmentTab` (episode picker, summary with
  `ProgressMeter`, assessment and plan cards), `AssessmentDialog` (with the 0–10 `PainScale`), `PlanDialog` (frequency and
  therapy chips), `VersionHistoryDialog`, `DischargeDialog`, `StartEpisodeButton` (owners pick a branch, pre-set from the
  branch scope; reused by `MarkAttendanceDialog`). Pure form rules in `clinicalForm.ts`. Each save is a new version; the
  server answers the unchanged version when nothing changed, so compare version numbers to tell the user. Opening an
  episode or a history is audited, so those queries use `staleTime` and never refetch on focus.
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
- **No delete actions** for clinical or financial data. Corrections are reversals (not built yet).
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

Session notes, reversals and refunds, PDF receipts and invoices, owner dashboard,
default fee setting, owner view of a staff member's trusted devices, reports, import/export, audit log viewer. Build on the `dev` branch via a feature branch.
