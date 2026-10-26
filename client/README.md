# Physio Clinic Manager: client

React PWA for the physiotherapy clinic management product. Specs live in [`../docs`](../docs):
[PRD](../docs/PRD.md), [API requirements](../docs/API-Requirements.md), [user stories](../docs/User-Stories.md),
[MVP checklist](../docs/MVP-Checklist.md).

## Stack

Vite · React 19 · TypeScript (strict) · Tailwind CSS v4 · shadcn/ui (Base UI) · React Router · TanStack Query ·
React Hook Form · `vite-plugin-pwa` · Vitest.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (money, financial year, mock business rules)
npm run typecheck
npm run lint
npm run build
```

## Demo mode (default)

There is no backend yet, so the client runs against an in-browser mock (`src/api/mock.ts`) with sample data kept in
`localStorage`. Sign in with `owner@demo.clinic`, `reception@demo.clinic` or `therapist@demo.clinic`, password
`demo1234`, email code `123456`. Clear the `physiocms.mockdb.v1` key to reset the data.

To use the real Express API instead, copy `.env.example` to `.env` and set `VITE_USE_MOCK_API=false`. The Vite dev
server proxies `/api` to `http://localhost:4000`.

## Structure

```
src/
  api/          Api contract (types.ts), mock.ts, http.ts, errors.ts: the only place that knows about the backend
  auth/         session context, hooks (useUser, useCan), route guards
  components/   ui/ (shadcn), layout/ (shell, sidebar, header), common/ (balance, section card, form field)
  features/     billing/, patients/, visits/: screens' dialogs and tabs
  pages/        one file per route
  lib/          money (integer paise), date (India time, financial year), query keys
  strings/      all UI text (en.ts); English only, kept out of components for later translation
```

## Rules the code follows

- **Money** is a string with two decimals everywhere; arithmetic uses integer paise (`lib/money.ts`). Never floats.
- **Permissions** come from the server as keys (`PermissionKey`). The UI hides actions with `useCan` / `<Can>`, but
  the server must enforce every one again.
- **Online only.** `useOnlineStatus` shows a banner and disables saving. Payments and attendance send an
  `Idempotency-Key`, and it is reused after a network failure so a retry cannot create a second entry.
- **No hard deletes** in the UI: there are no delete actions for clinical or financial data.
- **PWA** caches the app shell only (`vite.config.ts`); API data is never cached. Regenerate icons from
  `public/favicon.svg` with `npm run generate-pwa-assets`.

## Built so far (R1 slice)

Login with email code on a new device · app shell (sidebar, theme toggle, user menu) · receptionist home (search,
register button, today's visits) · register patient with duplicate-phone warning · patient profile (balance banner,
Overview / Treatment / Visits / Payments tabs) · mark attendance (dues warning, fee override, second-visit
confirmation, start episode) · record payment (cash, UPI, card, bank transfer; advance credit).

Not built yet: assessment and treatment plan forms, discharge, reversals and refunds, receipts/invoices as PDF, dashboard,
staff and role management, reports, import/export, audit log viewer.
