# NextSet

A personal, mobile-first gym logger with conservative progression guidance.
Log workouts quickly on your phone, review progress, and prepare the next session
with deterministic rules and optional Gemini assistance.

## From private project to public source

NextSet began as a private app for one person's training. This public edition
shares the application code, starter exercise data, and database migrations so
others can inspect the project and run their own instance.

The public repository starts with fresh Git history. The original private
history, personal workout logs, account details, local environment files, and
deployment metadata are excluded. Publishing the source does not open registration
on an existing instance or share its credentials. The app remains a work in
progress, with its original single-owner design.

## Important: one allowed account, public guest viewing

> **Set `ALLOWED_EMAIL` to your own Google account email before using the app.**
> Only that account can use the app's protected APIs and editing features.
> An unset or blank value denies owner access. There is no public onboarding or
> multi-user account system.

> **The email restriction protects editing, not viewing.** Guest mode is enabled
> by design: unauthenticated visitors can browse the owner's real workout history,
> dates, weights, reps, RPE, notes, analytics, templates, and AI reviews. This is
> not a demo dataset. Use data you are comfortable sharing, or change guest access
> before deploying personal training records.

The server validates the authenticated account against `ALLOWED_EMAIL`; hiding
buttons is not the authorization mechanism. Supabase RLS scopes records to their
owner, while the server uses an admin client for guest reads. The application
email check does not itself prevent Supabase from creating other Auth accounts.
Follow the sign-up restrictions in [the deployment guide](DEPLOYMENT.md).

## Features

- Fast session logging: templates, empty sessions, prepared drafts, per-set kg,
  reps and RPE, supersets, notes, completion, and a 90-second rest timer.
- Durable live-session saving, exercise reordering and replacement, and an
  offline preparation screen that persists drafts in the browser.
- Editable exercise library and Workout A/B/C starter templates, including
  per-set weights, rest times, and exercise import support.
- Conservative progression: pain, missed reps, or RPE >= 9 block load increases.
  Gemini output cannot override deterministic progression protections.
- Session reviews and editable next-session suggestions with duration estimates;
  optional ad-hoc AI coaching in the preparation screen.
- Analytics for weekly sets and volume, muscle targets, workout streaks,
  estimated 1RM, personal records, and fatigue flags.
- Mobile navigation and system/light/dark themes.

Workouts use kilograms. Analytics weeks start on Sunday in Singapore time.
Warm-up planning is intentionally out of scope.

## Stack

Next.js 16.2.6 App Router, React 19, TypeScript, Tailwind CSS 4, Supabase
Auth/Postgres/RLS, Gemini, Zod, Recharts, and @dnd-kit. Tests use Vitest;
Playwright is available for browser checks.

## Run locally

Use Node.js 24 and npm. Create your own Supabase project and configure Google
OAuth using [DEPLOYMENT.md](DEPLOYMENT.md), then run:

```bash
npm ci
cp .env.example .env.local
```

In PowerShell, use `Copy-Item .env.example .env.local`; use `npm.cmd` or `npx.cmd`
if PowerShell blocks the corresponding `.ps1` commands.

Fill in the ignored `.env.local` file with your own values. `ALLOWED_EMAIL` and
`SUPABASE_SERVICE_ROLE_KEY` are deliberately blank in the example. Keep the
service-role key and Gemini key server-side. Never prefix them with `NEXT_PUBLIC_`.

```bash
npm run dev
```

Open `http://localhost:3000`, sign in with the configured owner account, and import
the starter exercises/templates from the app. A blank Gemini key enables the
deterministic review/replacement fallback; the ad-hoc coach needs a working key.

## Deploy and publish

- [DEPLOYMENT.md](DEPLOYMENT.md): Supabase, Google OAuth, environment variables,
  Vercel configuration, access restrictions, and deployment checks.
- [PUBLISHING.md](PUBLISHING.md): publish this sanitized edition to a new GitHub
  repository without bringing back private history or files.
- [AGENTS.md](AGENTS.md): architecture, product constraints, and development rules.

Vercel runs the Next.js server and API routes. GitHub hosts the source; GitHub
Pages/static export cannot run this app's server-side authentication and APIs.

## Development checks

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Tests cover progression, analytics, AI validation, replacement logic, session
persistence/layout contracts, and allowed-email behavior. Local checks do not
certify deployed OAuth, database policies, or Gemini access.

Database changes belong in versioned files under `supabase/migrations/`. Review
pending migrations and their target project before applying them. Do not reset
or recreate a database that contains data you need to keep.

## Exercise data

The small starter library is bundled. The optional full-library import uses
[yuhonas/free-exercise-db](https://github.com/yuhonas/free-exercise-db) and preserves
source metadata. See [the source notes](src/data/exercise-library-source.md).
