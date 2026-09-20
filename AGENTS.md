# NextSet Agent Guide

## Project Overview

NextSet is a personal-use, mobile-first gym logger and conservative progression
advisor. It is intended for one allowed user, hosted on Vercel, with Supabase
providing authentication and storage. The core product goal is fast, reliable
session logging; AI assists with progression decisions and next-session drafts
rather than inventing arbitrary workouts.

The app is still in progress. Treat the implementation described below as the
current baseline, and verify behavior in code before expanding it.

## Product Constraints

- Single-user write access is enforced through `ALLOWED_EMAIL`; unauthenticated
  visitors get a read-only view of all pages (guest mode). There is no public
  onboarding flow.
- Workouts are currently full-body oriented and use kilograms.
- Analytics weeks start on Sunday and are calculated in Singapore time.
- Progression must be conservative: pain, missed reps, or RPE >= 9 must block
  a load increase.
- Warm-up planning is intentionally out of scope.
- Default rest time between sets is 90 seconds.

## Stack

- Next.js 16.2.6 App Router, React 19, and TypeScript.
- Tailwind CSS 4 for UI styling, including dark-mode variants.
- Supabase Auth, Postgres, and Row Level Security.
- Gemini structured review calls with a deterministic rule-based fallback.
- Zod for API and AI payload validation.
- Recharts for analytics visualization.
- @dnd-kit for drag-and-drop reordering (exercises, suggestions, templates).
- Vitest for progression, analytics, AI review, and replacement logic tests.
- Playwright available in devDependencies for future E2E testing.

## Implemented Features

- Auth: Google OAuth callback/session handling with server-side allowed-email
  checks for protected pages and API routes.
- Guest read-only mode: unauthenticated visitors browse all pages (home,
  history, analytics, templates, exercises, sessions) with mutation UI hidden;
  uses admin Supabase client for data reads.
- Dark mode: system/light/dark theme toggle with a pre-hydration script and
  localStorage key `nextset-theme`; shared UI surfaces and charts have dark
  variants.
- Exercise library: editable exercises, starter data import, and full external
  exercise-library import support with source metadata. Per-exercise
  `is_ai_suggestion_enabled` flag controls the AI suggestion pool. Exercise
  detail pages at `/exercises/[id]` show history, max weight, max workout
  volume, and best estimated 1RM.
- Templates: starter Workout A/B/C import; template editing, ordering, target
  sets/reps, per-set weights, rest times, and notes.
- Session logging: start from a template, accepted suggestion, prepared draft,
  or empty; record sets, weights, reps, RPE, completion and notes;
  add/remove/reorder exercises; add sets; finish or cancel a session. Editable
  `performedAt` and notes during and after completion. Completing a set requires
  kg, reps, and RPE, then starts a 90-second rest timer banner.
- Prepared sessions: offline workout planner at `/sessions/prepare` with
  localStorage persistence, template loading, per-set weight targets, and
  exercise replacement. Converts to a live session on start.
- Exercise replacement: deterministic scoring engine (muscle group, equipment,
  lift category, history, template presence) with optional AI re-ranking via
  Gemini. Available in live sessions, suggestions, and prep drafts.
- Review flow: completed session review pages show read-only logged set details
  above the AI review anchor. Completing a session saves an AI review and an
  editable next-session suggestion with estimated duration and session type
  (weekday/sunday). Suggestions can be accepted, deleted, reordered, replaced at
  exercise level, or used to start a workout. Status lifecycle:
  draft/accepted/used (no ignored).
- Conservative progression: deterministic rules enforce pain/high-RPE/missed
  rep protections and calculate increment recommendations from exercise
  metadata; AI output cannot override unsafe increases.
- Analytics: weekly workouts, sets, volume, volume by primary muscle group,
  estimated 1RM trends using Epley, basic personal records, weeks meeting the
  workout target, weekly target streak, recent high-RPE/pain flags, and weekly
  comparison vs. previous week.
- Weekly muscle group targets: 7 muscle groups with min/max weekly set targets,
  visualized as concentric rings or progress bars on the home dashboard.
  Secondary muscle work counts as half a set; arms track direct sets only.
- Day-based template ordering: home dashboard auto-promotes the day's scheduled
  workout (Singapore time), with queue advancement to avoid repeating the last
  completed template.
- AI session planning: exercise pool filtering (`is_ai_suggestion_enabled`),
  session type tagging (weekday 45-50 min / sunday 55-70 min), planning context
  with weekly muscle deficits, full-body coverage validation, and
  template-equivalence rejection.
- Data protection: migrations create per-user tables, indexes, triggers, and
  RLS policies for profiles, exercises, templates, sessions, reviews, and
  suggestions.

## Code Map

- `src/app/`: App Router pages and authenticated route handlers.
- `src/components/`: mobile UI for login, home, templates, logging, reviews,
  exercises, analytics, and shared controls.
- `src/components/ui/theme-script.tsx` and `src/components/ui/theme-toggle.tsx`:
  dark-mode initialization and system/dark/light theme switching.
- `src/components/layout/app-shell.tsx`: client component hosting the fixed
  header and the mobile bottom nav with route-aware active highlighting.
- `src/app/globals.css`: design foundation. Dark mode is applied through the
  `.dark .<utility>` override table at the bottom of the file (light utility
  classes are remapped to dark surfaces), so components are styled with
  light-mode classes and dark variants follow automatically. Extend the table
  when introducing new surface/color utility classes. Do not add `dark:` color
  utilities in components; use the global remap table. Non-color exceptions
  such as chart-specific behavior may use `dark:` where needed. Shared visual language:
  `rounded-2xl` cards, `rounded-xl` controls, emerald-600 accent, bold
  tabular-nums numeric readouts, minimum 44px touch targets.
- `src/lib/auth/` and `src/lib/supabase/`: access enforcement and Supabase
  browser/server/admin/proxy clients.
- `src/lib/domain.ts`: domain types, decisions, and tracked muscle groups.
- `src/lib/auth/allowed-user.ts`: required allowed-email configuration; missing or
  blank configuration denies owner access.
- `src/lib/muscle-groups.ts`: canonical muscle group name normalization.
- `src/lib/workout-schedule.ts`: day-of-week to template schedule mapping.
- `src/lib/validation/schemas.ts`: request payload and structured AI response
  schemas.
- `src/server/db/queries.ts`: Supabase reads and session mutations.
- `src/server/progression/rules.ts`: deterministic progression and volume/1RM
  calculations.
- `src/server/ai/review.ts`: Gemini call, fallback review generation, hard-rule
  overrides, and persisted suggestions.
- `src/server/analytics/calculations.ts`: Sunday/Singapore dashboard metrics,
  weekly muscle group targets, weekly target streaks, and per-exercise detail
  analytics.
- `src/server/exercise-import/`: import parsing and seed/library support.
- `src/server/exercise-replacements/`: scored replacement engine with optional
  AI re-ranking.
- `supabase/migrations/`: database schema and atomic template update RPC.
- `src/data/`: starter exercise/template JSON and source reference material.

## Data And Flow Notes

- A completed session owns logged exercises and sets; its generated review owns
  exercise decisions and a draft workout suggestion.
- Next-session selection is template-based where possible and evaluates
  two-session main-muscle coverage; the AI must preserve the deterministic
  selected template and targets.
- API inputs and saved AI JSON must remain Zod-validated.
- Supabase `user_id` scoping and RLS are part of the security model; maintain
  both when adding data operations.
- Suggestion status lifecycle is draft -> accepted -> used; "ignored" status was
  removed. Deleting a suggestion removes it from the database.
- AI suggestions include `estimated_duration_minutes` and `target_session_type`
  (weekday/sunday); these must be preserved when editing suggestions.
- Exercise replacement scoring uses muscle group, equipment, lift category,
  session history, and template presence; AI re-ranking is optional and must
  not override deterministic safety rules.
- Theme changes must update both light and dark classes and avoid hydration
  flicker by keeping `ThemeScript` behavior aligned with `ThemeToggle`.
- Exercise detail analytics use completed sessions only and Singapore-time
  formatting for display.

## Development Commands

```bash
npm run dev
npm run lint
npm run typecheck
npm run test
npm run build
```

## Improvement backlog

Open work for other agents lives in `IMPROVEMENTS.md`. Pick one ID, follow
that brief, then run lint / typecheck / test. Do not redo `done` P0 items
(G1–G5). Do not implement `skip` or `later` IDs unless the user asks.

## Working Rules

- Preserve LF line endings in edits.
- Keep changes mobile-first and optimized for low-tap gym logging.
- Treat the live session's sticky summary header, sticky exercise headers, and
  sticky bottom action buttons as protected layout contracts. Do not remove or
  weaken their sticky positioning, and do not add `overflow: hidden`, `auto`,
  or `scroll` to a live-session ancestor because that breaks sticky behavior.
  Use clipping that does not create a scroll container when horizontal overflow
  must be suppressed. Keep the sticky layout regression tests passing.
- Store schema and policy changes as versioned migrations under
  `supabase/migrations/`; do not rely on manual production schema edits.
- Keep secrets server-side. `SUPABASE_SERVICE_ROLE_KEY` and `GEMINI_API_KEY`
  must never enter client-side code.
- Do not weaken the allowed-email gate, RLS protections, Zod validation, or
  progression safety rules without an explicit requirement.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes -- APIs, conventions, and file structure may
all differ from your training data. Read the relevant guide in
`node_modules/next/dist/docs/` before writing any code. Heed deprecation
notices.
<!-- END:nextjs-agent-rules -->
