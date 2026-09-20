# NextSet improvement tracker

Pickup document for coding agents. Read `AGENTS.md` first. Then pick one ID,
set status to `doing`, implement, run checks, set status to `done`.

Status values: `todo` · `doing` · `done` · `later` · `skip`.

Do **one ID per session** unless a brief says it may be paired. Do not start
`later` or `skip` items unless the user explicitly asks.

## Status

| ID | Pri | Status | Item |
| --- | --- | --- | --- |
| G1 | P0 | done | Last-session overlay on each set, plus one-tap copy last / copy that set |
| G2 | P0 | done | Persist rest timer across refresh/lock; vibrate/beep on rest end; wake lock |
| G3 | P0 | done | Resume in-progress workout card on Home and Start session |
| G4 | P0 | done | PWA: iOS home-screen metadata, PNG apple-touch icon, production SW |
| G5 | P0 | done | Haptic (and beep) confirm on set complete |
| R1 | P1 | done | Stop loading all nested history for analytics / AI / replacements |
| R2 | P1 | done | Unify Gemini model via `GEMINI_MODEL`; trim review history at query time |
| R3 | P1 | done | Scan session notes and exercise notes for pain, not only set notes |
| R4 | P1 | done | Add `app/error.tsx` with reload / go home |
| M1 | P2 | later | Split `session-logger.tsx` (SetRow, rest timer, autosave) |
| M2 | P2 | later | Split `queries.ts` by entity |
| M3 | P2 | later | Split `prepared-session-editor.tsx` |
| M4 | P2 | done | Pick one dark-mode strategy (remap table **or** `dark:` utilities) |
| M5 | P2 | done | UI to edit `weekly_workout_target` |
| E1 | P2 | done | CI: lint, typecheck, test on push |
| A1 | P3 | done | e1RM / top-set chart on `/exercises/[id]` |
| A2 | P3 | done | History search / filter by exercise, date, template |
| A3 | P3 | later | Warm-up vs working-set flag if warm-ups start getting logged |
| A4 | P3 | later | Bodyweight / assisted load modeling |
| E2 | P3 | later | Playwright E2E for start → log set → finish → sticky header |
| E3 | P3 | later | Move the working copy off cloud-synced storage |
| X1 | — | skip | Guest read-only mode is intentional |
| X2 | — | later | Data export / backup (not a priority) |

No active `todo` items remain. M1–M3 and the other `later` items are deferred.

R3 is small and safety-related. R1 is larger; R2 overlaps it, so if doing both
in one stretch, do R2 first then R1.

## Global constraints (do not violate)

- Personal single-user app. Do not add multi-user, onboarding, or SaaS features.
- Guest read-only browsing is **intentional**. Do not hide guest data reads.
- Data export (X2) is **not a priority**. Do not implement unless asked.
- Warm-up planning is out of scope.
- Kilograms only. Analytics weeks start Sunday, Singapore time.
- Conservative progression: pain, missed reps, or RPE >= 9 must block increases.
  AI cannot override deterministic safety rules.
- Live session sticky header / exercise headers / footer are a protected layout
  contract. Do not add `overflow: hidden|auto|scroll` on a live-session ancestor.
  Keep `src/components/session/session-layout-contract.test.ts` passing.
- Secrets stay server-side. Never put `SUPABASE_SERVICE_ROLE_KEY` or
  `GEMINI_API_KEY` in client code.
- Schema changes go in `supabase/migrations/`. Do not hand-edit production.
- Preserve LF line endings. Mobile-first, large tap targets (min ~44px).
- Next.js 16 App Router. Read `node_modules/next/dist/docs/` before using APIs.
- Checks after every change: `npm run lint && npm run typecheck && npm run test`.

## Already done — do not redo

P0 gym-day work shipped. Key files:

- Previous sets: `src/lib/previous-sets.ts`, `/api/exercises/[id]/previous-sets`,
  overlay + Copy in `session-logger.tsx`
- Rest timer persistence: `src/components/session/rest-timer.ts` (own
  localStorage key, not mixed into live-session sync revision)
- Haptics: `src/lib/haptics.ts`, wake lock: `src/lib/wake-lock.ts`
- Resume card: `src/components/session/resume-session-card.tsx` on Home and
  `/sessions/new`; query `findActiveSession` in `queries.ts`
- PWA: `src/app/apple-icon.tsx`, `appleWebApp` metadata, `public/sw.js`,
  `PwaRegister` (production only)

---

## R3 — Pain notes on session and exercise (P1)

### Goal

Progression and fatigue watch must treat pain mentioned in **session notes** or
**exercise notes** the same as pain in a set note.

### Why

`recommendProgression` only regex-scans `session_sets.note`. A user can write
“sharp knee pain” on the session or exercise and still get an increase.

### Current state

- Shared-ish regex, copied in three places:
  - `src/server/progression/rules.ts` (`PAIN_PATTERN`, set notes only)
  - `src/server/analytics/calculations.ts` (`buildFatigueWatchList`, set notes only)
  - `src/server/ai/weekly-analysis.ts` (already scans session notes, exercise
    notes, **and** set notes)
- Tests: `src/server/progression/rules.test.ts` (“watches pain notes before
  load progression”) only covers set notes.

### Implementation

1. Extract one helper, e.g. `src/lib/pain.ts`:
   - `PAIN_PATTERN` (keep the existing word list)
   - `textMentionsPain(value: string | null | undefined): boolean`
   - `sessionMentionsPain(session: { notes: string | null; session_exercises: Array<{ notes: string | null; session_sets: Array<{ note: string | null }> }> }): boolean`
   - `exerciseMentionsPain(exercise: { notes: string | null; session_sets: Array<{ note: string | null }> }): boolean`
2. Use it from progression, fatigue watch list, and weekly-analysis. Delete
   duplicate regexes.
3. Change `recommendProgression` to accept session notes as well as the
   exercise. The function currently only receives `sessionExercise` + `sets`.
   Add an optional `sessionNotes?: string | null` (or pass the parent session)
   and treat session notes, `sessionExercise.notes`, and set notes as pain.
4. Update every `recommendProgression(` caller to pass session notes when
   available (`src/server/ai/review.ts`, `coach.ts`, `weekly-analysis.ts`,
   `exercise-replacements/replacements.ts`).
5. Fatigue watch list: if session notes mention pain, flag the session’s
   exercises (or add a session-level event). Prefer flagging each exercise in
   that session that was trained, or a single session-level watch item if that
   is cleaner. Do not drop existing per-exercise set-note flags.

### Tests

- Progression: session note “sharp shoulder pain” with otherwise increase-able
  sets → `watch_pain`. Same for `sessionExercise.notes`.
- Set-note pain still works.
- Non-pain notes (“sore from yesterday”, “pinch collar”) — only the existing
  word-boundary list should match. Do not broaden the regex unless a test
  requires it.
- Fatigue watch list test in `calculations.test.ts` if one exists; add one if
  not.

### Acceptance

- Pain in session notes, exercise notes, or set notes blocks load increase.
- Weekly analysis still detects those same notes (no regression).
- No behavior change for notes that do not match `PAIN_PATTERN`.

### Out of scope

- NLP / Gemini pain detection.
- Changing the conservative increase rules besides the pain source.

---

## R4 — Route error UI (P1)

### Goal

Unhandled render/route errors show a NextSet-styled page with Reload and Home,
not the default Next.js error overlay in production.

### Why

A throw during a gym session currently dumps the framework error UI.

### Current state

- `src/app/loading.tsx` exists (spinner card).
- No `src/app/error.tsx` and no `src/app/global-error.tsx`.
- Visual language: `rounded-2xl` cards, emerald-600 accent, min 44px targets.
- Dark mode: either light classes (remapped in `globals.css`) or explicit
  `dark:` — match `loading.tsx` (light classes).

### Implementation

1. Add `src/app/error.tsx` as a client component (`error.tsx` must be a client
   component). Props: `{ error, reset }`.
2. Copy the card treatment from `loading.tsx`. Copy: short title (“Something
   went wrong”), one-line body, no stack trace.
3. Buttons: **Try again** calls `reset()`. **Home** links to `/` via
   `AppLink` from `@/components/ui/app-activity` if that works inside
   `error.tsx`; otherwise a plain `<a href="/">`.
4. Optional: `src/app/global-error.tsx` wrapping `<html><body>` for root
   layout failures. Only add if it is straightforward in Next 16. Read the
   Next 16 error-file docs first.

### Acceptance

- `error.tsx` is a client component, uses `reset`, has Home.
- Matches existing mobile card styling.
- No secrets or error.digest dumped to the user.

### Out of scope

- Per-route nested `error.tsx` files.
- Sentry / reporting.

---

## R2 — Unify Gemini model + trim review history (P1)

### Goal

One documented model env var. Review/coach/replacements/weekly-analysis must
not each invent a different default. Review must not fetch **all** sessions
just to slice 20.

### Why

- `review.ts` and `weekly-analysis.ts` and `replacements.ts`:
  `process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite"`
- `coach.ts`: `process.env.GEMINI_COACH_MODEL ?? "gemini-3.5-flash"`
- `README.md` documents `GEMINI_MODEL="gemini-2.5-flash"`
- `reviewAndSaveSession` calls `listAllCompletedSessionDetails` then
  `recentSessions = allCompletedSessions.slice(0, 20)`

### Implementation

1. Add `src/server/ai/models.ts` (or similar):
   - `GEMINI_BASE_URL` in one place
   - `getGeminiModel()` → `process.env.GEMINI_MODEL?.trim() || "gemini-3.1-flash-lite"`
   - `getGeminiCoachModel()` → `process.env.GEMINI_COACH_MODEL?.trim() || getGeminiModel()`
   Coach may keep an optional override, but the **default** must be the same
   shared model, not a second hardcoded family.
2. Replace every local `DEFAULT_MODEL` / `DEFAULT_COACH_MODEL` / duplicated
   base URL.
3. Update `README.md` env example to the actual default
   (`gemini-3.1-flash-lite`) and mention optional `GEMINI_COACH_MODEL`.
4. History trim (can land here even if R1 is not done):
   - In `review.ts`, stop calling `listAllCompletedSessionDetails`.
   - Use `listCompletedSessionDetails(supabase, userId, 20)` for the Gemini
     prompt / recent performance.
   - For weekly planning context, use `listCompletedSessionDetailsInRange`
     for the planning week (and comparison week if needed), not the full
     history dump.
   - Keep deterministic template selection working. Read
     `getSuggestionPlanningRange` / `buildPlanningContext` before changing
     which sessions are passed in.

### Tests

- `src/server/ai/review.test.ts` and `coach.test.ts` still pass.
- If review tests mock `listAllCompletedSessionDetails`, update the mock to
  the new query function.
- No snapshot of full history required for unit tests.

### Acceptance

- Grep finds a single default model string (or only in `models.ts`).
- README matches code.
- `reviewAndSaveSession` no longer calls `listAllCompletedSessionDetails`.
- Coach still works with fallback when Gemini is missing.

### Pairing

Safe to pair with R1 if you are already in the query layer. Otherwise ship R2
alone.

---

## R1 — Stop loading all nested history (P1)

### Goal

Analytics, exercise detail, AI review, and replacements must not hydrate every
completed session with nested exercises+sets.

### Why

`listAllCompletedSessionDetails` pages 250 rows at a time with
`session_exercises(*, exercise:exercises(*), session_sets(*))`. Fine at ~40
sessions; slow at hundreds. Callers:

- `src/app/analytics/page.tsx`
- `src/app/api/analytics/route.ts`
- `src/app/exercises/[id]/page.tsx`
- `src/server/ai/review.ts` (also R2)
- `src/server/exercise-replacements/replacements.ts`

Already exists and should be reused:

- `listCompletedSessionDetails(supabase, userId, limit = 80)`
- `listCompletedSessionDetailsInRange(supabase, userId, start, end)`

Analytics math lives in `src/server/analytics/calculations.ts` and currently
expects `SessionWithDetails[]`.

### Implementation (expand/contract, no schema required unless needed)

Prefer query-shape changes over a big SQL rewrite.

1. **Exercise detail** (`/exercises/[id]`): add
   `listCompletedSessionsForExercise(supabase, userId, exerciseId)` that inner-
   joins `session_exercises` on that `exercise_id`, status completed, ordered
   by `performed_at`. Pass that into `buildExerciseDetailAnalytics`. Do not
   load other exercises’ sets.
2. **Replacements**: they only need recent history for scoring. Use
   `listCompletedSessionDetails(supabase, userId, 20)` (or similar) instead of
   all history. Update `replacements.test.ts` mocks.
3. **Analytics dashboard / API**: options, pick the smallest that keeps
   charts correct:
   - Short term: cap at a high but finite window (e.g. last 104 weeks /
     last 300 sessions) via `listCompletedSessionDetails` with a documented
     limit, **if** PRs, weekly trend, and e1RM charts remain acceptable.
   - Better: add a compact query (session header + completed sets only, or
     SQL aggregates for weekly totals / PRs) and adapt
     `buildDashboardAnalytics` to the compact type.
   Do not silently drop personal records from early history if you can avoid
   it. If you cap, document the cap in the analytics UI in one short line
   (“Last N sessions”) rather than lying.
4. Delete `listAllCompletedSessionDetails` once it has zero callers, or keep
   it as a thin wrapper only if a test still needs it.

### Tests

- `calculations.test.ts` should keep using in-memory fixtures; no DB.
- Replacement tests: mock the new list function.
- If you add a new query helper that is pure (normalize/map), unit test the
  mapper.

### Acceptance

- `grep listAllCompletedSessionDetails` is empty (or only a deprecated
  wrapper with no app-route callers).
- Exercise detail only loads that exercise’s sessions.
- Home dashboard already uses `listCompletedSessionDetails` (limit 80) —
  do not make Home slower.
- Sticky layout tests untouched.

### Out of scope

- Materialized views, cron, or caching layers.
- Changing Singapore-week or Epley formulas.

---

## E1 — CI on push (P2)

### Goal

GitHub Actions runs lint, typecheck, and unit tests on push and pull request
to `main`.

### Why

No `.github/` workflows exist. Playwright is in `package.json` but unused —
do **not** run Playwright in CI until E2 exists.

### Implementation

1. Add `.github/workflows/check.yml`.
2. Triggers: `push` and `pull_request` to `main` (and `master` if that is
   ever used; current branch is `main`).
3. Job: Node 20 or 22 (match local if possible), `npm ci`, then
   `npm run lint`, `npm run typecheck`, `npm run test`.
4. No secrets required. Do not boot Next.js or talk to Supabase.
5. Cache npm via `actions/setup-node` cache.

### Acceptance

- Workflow file is valid YAML.
- `npm run test` is `vitest run` only.
- No required Vercel/Supabase env vars.

---

## M5 — Edit weekly workout target (P2)

### Goal

Owner can change `profiles.weekly_workout_target` in the UI. Streak and
“this week X/Y” already read it.

### Why

Column exists (`weekly_workout_target`, default 3, check 1–14).
`getProfilePreferences` reads it. There is **no** update API or UI.
Muscle targets are already editable in `MuscleProgressCard` via
`PATCH /api/profile/weekly-muscle-targets`.

### Implementation

1. Add `PATCH /api/profile/weekly-workout-target` (or extend the existing
   profile route). Zod: integer 1–14.
2. Add `updateWeeklyWorkoutTarget` in `queries.ts` (or the profile query
   module after M2).
3. UI: small editor on Home near the “This week X/Y” metric, or on
   Analytics. Owner only. Guest hidden. Match muscle-target edit pattern
   (pencil, save, cancel, `fetchWithActivity`).
4. After save, `router.refresh()` so streak / metric cards update.

### Tests

- Zod schema test for bounds (0, 15, 3).
- No Playwright.

### Acceptance

- Owner can set 1–14.
- Guest cannot see the control.
- Home metric denominator updates after save.
- RLS / `requireAllowedUser` on the route.

### Out of scope

- Changing week start day (`week_start_day` column exists but product is
  Sunday / Singapore — do not expose it).

---

## M1 — Split `session-logger.tsx` (P2)

### Goal

Break the ~2.1k-line live logger into focused modules without changing
behavior or sticky layout.

### Why

Logging, rest timer, autosave, previous-set copy, supersets, and SetRow live
in one client file. High regression risk.

### Current protected contracts

- `src/components/session/session-layout-contract.ts`
- `src/components/session/session-layout-contract.test.ts` **reads
  `session-logger.tsx` source** and asserts the className constants are
  used. If you move JSX, update that test to the new file(s) that render
  the sticky nodes. Do not weaken sticky classes.
- Related already-extracted modules (reuse, do not duplicate):
  - `live-session-persistence.ts`
  - `rest-timer.ts`
  - `session-completion.ts`
  - `src/lib/previous-sets.ts`
  - `src/lib/haptics.ts`
  - `src/lib/wake-lock.ts`
  - `src/lib/supersets.ts`

### Suggested split (behavior-identical)

- `set-row.tsx` — set inputs, RPE pad, last-set copy line, complete toggle
- `rest-timer-banner.tsx` — banner UI only
- `live-session-autosave.ts` — revision, backup, sync, online/offline
  (keep using existing persistence helpers)
- `session-logger.tsx` — composition, exercise list, finish/cancel

Do not introduce a scroll container around the session.

### Tests

- Layout contract still passes (update file path if needed).
- `session-completion.test.ts`, `live-session-persistence.test.ts`,
  `previous-sets.test.ts`, `rest-timer.test.ts` still pass.
- No visual redesign.

### Acceptance

- Same logging UX. Sticky header/footer/exercise headers still sticky on
  iOS Safari (do not add overflow on ancestors).
- File sizes: logger well under 1000 lines after split, ideally.

### Out of scope

- Rewriting autosave protocol or backup version.
- New features.

---

## M2 — Split `queries.ts` by entity (P2)

### Goal

`src/server/db/queries.ts` (~1.6k+ lines) split by entity without changing
SQL behavior.

### Suggested modules under `src/server/db/`

- `profile.ts`
- `exercises.ts`
- `templates.ts`
- `sessions.ts` (including live sync, finish, cancel)
- `suggestions.ts`
- `analytics.ts` (weekly analyses, deload weeks)
- `index.ts` re-exports everything so existing
  `from "@/server/db/queries"` imports keep working

Keep `normalizeSessionDetails` / `normalizeExercise` / `normalizeSet` in a
`normalize.ts` used by session queries.

### Acceptance

- `grep from "@/server/db/queries"` still typechecks (barrel re-export).
- No query behavior change.
- `listAllCompletedSessionDetails` handled according to R1 status (if R1
  not done, move it with sessions; if done, it should already be gone).

### Out of scope

- Rewriting queries or adding a repository abstraction.

---

## M3 — Split `prepared-session-editor.tsx` (P2)

### Goal

Same as M1 for the offline planner (~1.5k lines) at
`src/components/session/prepared-session-editor.tsx`.

### Notes

- Persists to localStorage. Do not change the storage key/shape unless you
  add a versioned parser with backward compatibility.
- Has exercise replacement, per-set weights, template loading.
- Converts to a live session on start (`/api/sessions/start`).
- Not bound by the live-session sticky contract, but stay mobile-first.

### Suggested split

- Draft persistence helpers + tests
- Exercise/set editors
- Shell that loads template / starts session

### Acceptance

- Existing prep draft still loads after the split.
- Start-from-prep still works (manual check if no E2E).

---

## M4 — One dark-mode strategy (P2)

### Goal

Stop mixing the `globals.css` light-class remap table with scattered
`dark:` utilities.

### Current state

- `src/app/globals.css` maps `.dark .bg-white`, `.dark .text-slate-900`,
  etc., so most components can use light classes only.
- `AGENTS.md` says: style with light-mode classes; extend the remap table
  when adding new surface colors.
- Several components already use `dark:` (`exercise-detail.tsx`,
  `muscle-progress-card.tsx`, `session-logger.tsx`, `theme-toggle.tsx`, …).

### Decision (recommended)

**Keep the remap table as source of truth** (less churn, matches AGENTS.md).

1. Strip redundant `dark:` from components when the remap already covers
   that utility.
2. If a `dark:` is needed because the remap has no mapping, **add the
   mapping to `globals.css`** instead of a one-off `dark:`.
3. Document in `AGENTS.md`: do not add `dark:` in components unless the
   class is not a surface/text color (e.g. charts).

Alternative (only if the user asks): migrate fully to `dark:` and delete
the remap table. That is a large mechanical PR; do not do it by default.

### Acceptance

- Dark theme still works for Home, live session, analytics charts.
- `ThemeScript` / `ThemeToggle` behavior unchanged (`nextset-theme` key).
- No hydration flicker.

---

## A1 — Exercise detail e1RM / top-set chart (P3)

### Goal

`/exercises/[id]` shows a small strength chart (e1RM and/or top set over
time), not only a history list.

### Current state

- `buildExerciseDetailAnalytics` in `calculations.ts` already has history,
  max weight, max volume, best e1RM.
- `ExerciseDetail` is a server component list.
- Analytics dashboard already has Recharts `LineChart` for
  `analytics.strengthTrends` — reuse that visual language.
- Dates: Singapore time, same as other analytics.

### Implementation

1. Extend `ExerciseDetailAnalytics` with chart points:
   `{ date, estimatedOneRepMax, maxWeight, sessionId }[]` from completed
   sets, Epley from `epleyEstimatedOneRepMax`.
2. Client child chart component (Recharts needs client). Keep the page
   server-rendered; pass points in.
3. Empty state when < 2 sessions.
4. Mobile: full width, not a tiny unreadable chart. Dark-mode via existing
   `.dark .recharts-*` rules in `globals.css`.

### Pairing

If R1 is not done, this page still loads all sessions. Prefer R1 first, or
at least use `listCompletedSessionsForExercise`.

### Acceptance

- Chart matches the numbers in the history list for the same sessions.
- Guest can view it (read-only page).

---

## A2 — History search / filter (P3)

### Goal

`/history` can filter the session list by text (name / exercise), date
range, and template.

### Current state

- `src/app/history/page.tsx` loads `listRecentSessions(..., 50)` and
  renders `SessionSummaryCard`.
- No search, no pagination beyond 50.

### Implementation

1. Raise or paginate the list if needed (50 is tight once history grows).
   Prefer server filter over shipping all sessions to the client.
2. Controls: search input, optional template `<select>`, optional from/to
   dates. Mobile stacked, 44px targets, clear button (iOS).
3. Filter by session name, exercise name, template id, `performed_at`.
4. Guest can use filters (read-only). Owner-only mutation UI stays hidden.

### Acceptance

- Filtering “bench” shows sessions that include that exercise.
- Empty state when nothing matches.
- Does not break session links (completed → review, active → logger).

### Out of scope

- Infinite scroll polish, CSV export (X2).

---

## A3 — Warm-up vs working sets (P3, later)

Do not implement unless the user starts logging warm-ups and asks.

If started: add `is_working` (or `set_kind: warmup | working`) on
`session_sets` via migration, default working. Volume, e1RM, PRs, and
progression should ignore warm-ups. Live logger needs a low-tap way to
mark a set as warm-up without slowing the working-set path.

---

## A4 — Bodyweight / assisted load (P3, later)

Do not implement unless asked.

`weight_kg` of 0 looks like an empty set. Pull-ups + added weight vs true
bodyweight vs assistance are not modeled. Would need bodyweight on
profile, lift_category `bodyweight` handling, and volume rules. Easy to
get progression wrong — design with the user first.

---

## E2 — Playwright gym-path E2E (P3, later)

`playwright` is in `devDependencies` but there are no specs. When starting:

- Cover: login skip or fixture, start template, log one set (kg/reps/RPE/
  complete), rest banner appears, finish.
- Assert sticky header/footer class contract still present (or visible).
- Do not run in E1 CI until this is stable and has a test user strategy.
- Gym logging is auth-gated; needs a dedicated local/test Supabase or a
  mocked session. Do not commit secrets.

---

## E3 — Leave cloud-synced storage (P3, later)

Operator task, not a code change.

Cloud-synced folders can corrupt `node_modules` and confuse file watchers.

Move to a local non-iCloud path (e.g. `~/works/NextSet`), `git remote`
unchanged. Optional: `opencode` `session_move` if using a worktree.

---

## X1 — Guest mode (skip)

Unauthenticated visitors may read all pages via the admin Supabase client.
This is intentional. Do not password-gate reads or strip session notes
from guests unless the user changes their mind.

---

## X2 — Data export (later, not a priority)

User explicitly deprioritized. If asked later: owner-only JSON (or CSV)
download of sessions, sets, exercises, templates. No guest access.
Server route + `requireAllowedUser`.

---

## After finishing an ID

1. Set that row to `done` in the status table.
2. Run `npm run lint && npm run typecheck && npm run test`.
3. Do not start the next ID unless the user asked for a batch.
