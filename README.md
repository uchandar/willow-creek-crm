# Willow Creek Sober Living — CRM

A staff-facing CRM for running a sober living house: resident intake, bed
management, daily check-ins / accountability, case notes, and rent tracking.

Built from scratch (no suitable open-source base existed to fork — see note
at the bottom) as a simple, self-hosted web app:

- **Backend:** Node + Express + SQLite (`better-sqlite3`), session-based staff login
- **Frontend:** React + TypeScript + Vite, plain CSS (no component library)

## Features

- **Staff login** — email/password, session cookies, admin vs. house manager roles
- **Dashboard** — occupancy, today's check-ins, flagged check-ins, overdue payments, open/overdue tasks, pending screenings, recent case notes
- **Residents** — intake form, emergency contact, referral source, status (active / alumni / discharged), filter by status, admin-defined custom fields
- **Rooms & beds** — occupancy board, add/delete beds (admin only), see who's in each bed and the monthly rate
- **Resident detail** — tabs for check-ins, drug screenings, case notes, tasks, and payments
- **Tasks** — house-wide follow-up list, optionally tied to a resident, with due dates and a done/open toggle
- **Activity log** — admin-only audit trail of status changes, flagged check-ins, incident notes, screening results, and other consequential actions
- **Settings** — admin-only page to define custom fields on residents (text, number, date, select, checkbox) with no code changes

### Where these came from

You pointed to three CRMs and asked for their standout features. None of the three are mergeable as-is — Twenty is a TypeScript/GraphQL monorepo built around its own data layer, EspoCRM and Krayin are PHP — so rather than a surface-level copy, each pattern below was implemented natively against this app's existing stack:

- **Custom fields engine** (Twenty, Krayin) — an EAV-backed custom-fields system (`custom_field_defs` / `custom_field_values` tables) lets an admin add a new resident field from the **Settings** page — e.g. "Case Worker" or "Insurance Provider" — with zero schema migrations or code changes. This is the same idea behind Twenty's custom objects/fields and Krayin's extensibility.
- **Drug Screenings module** — a dedicated `drug_screenings` table and tab on each resident (panel, result, flagged substances, who administered it), the exact example you flagged from the Twenty CRM reference material.
- **Enforced role/permission system** (EspoCRM) — `house_manager` accounts can run day-to-day operations (check-ins, notes, screenings, tasks) but are blocked at the API layer (403, not just hidden UI) from admin actions: adding/removing beds, defining custom fields, correcting screening results, and viewing the activity log. The nav and page UI hide those controls for non-admins too.
- **Audit log** (EspoCRM) — a selective `audit_log` table records who did what: resident creation, status changes, flagged/missed check-ins, incident notes, screening results, and bed/field admin actions. Viewable admin-only at **Activity log**. Deliberately not every routine write (e.g. a normal paid payment) to keep it a signal, not noise — appropriate for the HIPAA-adjacent privacy posture EspoCRM is known for.
- **Tasks/reminders** (Krayin) — a lightweight activities/follow-ups model: house-wide list at **Tasks**, plus a per-resident Tasks tab, each with a due date and open/done status.

## Running it

Requires Node.js 18+.

### 1. Backend

```bash
cd server
npm install
npm run seed   # creates the database, a default admin login, and 6 demo beds
npm start       # runs on http://localhost:4000
```

Default login created by the seed script:

```
email:    admin@willowcreeksober.org
password: ChangeMe123!
```

**Change this password (or create a new admin and remove this one) before
using the app with real resident data.** There's no account-management UI
yet — the quickest way is to run `node -e` with the `hashPassword` helper in
`server/src/auth.js`, or add a small script, to insert/update a `staff` row.

### 2. Frontend

In a second terminal:

```bash
cd client
npm install
npm run dev     # runs on http://localhost:5173
```

Open http://localhost:5173 — the dev server proxies `/api` requests to the
backend on port 4000, so both just need to be running.

### Production build

```bash
cd client
npm run build   # outputs static files to client/dist
```

Serve `client/dist` with any static file host, and run the `server` process
behind it (or behind a reverse proxy that forwards `/api` to it). Set
`SESSION_SECRET` and `CLIENT_ORIGIN` environment variables for the server in
production, and set the session cookie's `secure: true` in
`server/src/index.js` once it's served over HTTPS.

## Data model

SQLite tables: `staff`, `rooms` (beds), `residents`, `checkins`, `case_notes`,
`payments`, `custom_field_defs`, `custom_field_values`, `drug_screenings`,
`tasks`, `audit_log`. See `server/src/db.js` for the full schema — it's a
plain, readable `CREATE TABLE` block, easy to extend.

## What's not in this version

This covers the core of day-to-day house operations plus the custom-fields,
permissions, screenings, tasks, and audit-log patterns from Twenty/EspoCRM/
Krayin. Reasonable next steps, not built yet:

- Account/staff management UI (currently: one seeded admin; use `node -e`
  with the `hashPassword` helper in `server/src/auth.js`, or a small script,
  to add/update `staff` rows)
- Resident-facing portal (this is staff-only, per your request)
- File uploads / document storage
- Automated rent reminders or SMS/email notifications
- Reporting/export (CSV, etc.)
- Multi-house support (currently assumes one location)
- Custom fields on entities other than residents (the engine supports it —
  `entity` is just a string column — but only resident fields have UI so far)

## Note on "Sober Living Companion"

I checked GitHub and the web for an open-source project to fork named
"Sober Living Companion" or similar — it only exists as an iOS App Store app
with no public source. The GitHub repos you pointed me to
(`charlesschaefer/addiction-tracker`, `seaglade/Sobriety`,
`jasonchn18/drug-addiction-recovery-app`) are all single-user personal
sobriety/habit trackers, not multi-user staff CRMs, so none were a workable
starting point — this app was written from scratch instead.
