# Deploy NextSet

This guide deploys your own instance to Vercel with a separate Supabase project.
No existing private deployment, credentials, or workout database is included.

## 1. Understand access before adding data

**`ALLOWED_EMAIL` is required and accepts one email address.** Use the exact Google
account you will sign in with; comparison ignores case and surrounding spaces.
Do not use a comma-separated list, a domain, or a wildcard. Blank/unset denies
owner access. Other accounts cannot use the application's protected APIs.

**Unauthenticated guests can read the owner's actual data.** Guest mode includes
workout history, notes, analytics, templates, and AI reviews. It remains enabled
even when the owner email is restricted. A public source repository does not
require exposing personal data: deploy only shareable data, or implement private
guest access before using the app for confidential records.

## 2. Create and migrate your Supabase project

1. Create a dedicated Supabase project. Keep its database password outside Git.
2. Save its project URL, publishable key (or legacy anon key), and server-side
   service-role/secret key from the project's API settings.
3. From this repository's root, authenticate and link the CLI to that project:

   ```bash
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase migration list
   npx supabase db push --dry-run
   ```

4. Verify the selected project and review the pending SQL, then apply it:

   ```bash
   npx supabase db push
   ```

All schema changes are in `supabase/migrations/`. The push command writes to the
linked database; do not point it at an unrelated or existing private project.
Keep `.temp` metadata, CLI credentials, and database exports out of Git. Do not
run database reset/recreation commands against data you need to preserve.

The starter workout/exercise imports run from the app after owner sign-in; a
database push does not populate personal workouts.

See [the Supabase CLI reference](https://supabase.com/docs/reference/cli/supabase-db-push).

## 3. Configure Google sign-in and Supabase account creation

1. Create a Google OAuth web client in Google Cloud. Configure the consent
   screen; if it is in testing mode, add your owner account as a test user.
2. In Supabase Authentication, enable the Google provider and save the Google
   client ID and secret there. Do not put the client secret in frontend code.
3. Add Supabase's callback URL to the Google client's authorized redirect URIs:
   `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`.
4. In Supabase URL Configuration, add `http://localhost:3000/auth/callback` for
   local development. Later add your exact deployed `/auth/callback` URL and
   set the Site URL to your production origin.

The two callbacks serve different purposes: Google returns to **Supabase's**
`/auth/v1/callback`; Supabase then returns to **NextSet's** `/auth/callback`.
See [Google sign-in](https://supabase.com/docs/guides/auth/social-login/auth-google)
and [redirect URL configuration](https://supabase.com/docs/guides/auth/redirect-urls).

### Restrict new Supabase accounts

`ALLOWED_EMAIL` is an app-level check. The shipped RLS policies enforce each
authenticated user's ownership; they do not use this environment variable as a
database-wide email allowlist. Therefore, also restrict account creation:

1. While the new instance is still under deployment protection, temporarily allow
   sign-ups and complete Google sign-in with your configured owner account once.
   This creates the Auth user and application profile.
2. Verify the owner is present in Supabase Authentication -> Users and that no
   unintended accounts are present.
3. Turn off **Allow new users to sign up** in Supabase Auth settings. Existing
   users can still sign in. Keep unused providers and anonymous sign-ins disabled.
4. Sign out and confirm that the owner can sign back in. Confirm a different
   Google account cannot obtain application write access.

Changing `ALLOWED_EMAIL` alone neither removes existing Supabase users nor
transfers old workouts to a new owner. Review any existing Auth users before
reusing a project. [Supabase Auth settings](https://supabase.com/docs/guides/auth/general-configuration)
control registration separately from this application's authorization.

## 4. Set environment variables

For local development, copy `.env.example` to ignored `.env.local`. On Vercel,
enter actual values without the surrounding quotation marks in Project Settings
-> Environment Variables before deploying.

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Your Supabase project URL; visible to browsers. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes | Publishable or legacy anon key; visible to browsers. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-side service-role/secret key for guest reads and admin operations. Never publish it. |
| `ALLOWED_EMAIL` | Yes | Your one allowed Google account email; no default owner. |
| `GEMINI_API_KEY` | For AI calls | Server-side Gemini key. Blank enables review/replacement fallback; ad-hoc coaching requires it. |
| `GEMINI_MODEL` | Optional | Review, weekly analysis, and replacement model; see `.env.example`. |
| `GEMINI_COACH_MODEL` | Optional | Ad-hoc coaching model; see `.env.example`. |

Choose Gemini models available to your account that support the app's structured
JSON requests. Missing keys or provider failures use deterministic fallback where
implemented; they do not guarantee that ad-hoc coaching will work.

Service-role/secret keys bypass RLS, so keep them out of browser code, screenshots,
logs, and source control. [Supabase key documentation](https://supabase.com/docs/guides/getting-started/api-keys).
Never prefix `ALLOWED_EMAIL`, `SUPABASE_SERVICE_ROLE_KEY`, or `GEMINI_API_KEY` with
`NEXT_PUBLIC_`. Redeploy after changing environment variables; browser-prefixed
values are included at build time. [Vercel environment variables](https://vercel.com/kb/guide/how-to-add-vercel-environment-variables).

## 5. Deploy on Vercel

1. Publish the sanitized repository using [PUBLISHING.md](PUBLISHING.md).
2. Import it into a **new** Vercel project. Select the Next.js framework, use the
   repository root, Node.js **24.x**, install command `npm ci`, and build command
   `npm run build`. Leave the output directory at the framework default.
3. Add the environment variables above to Production. Use a separate Supabase
   project and keys for Preview/Development if enabling those environments; do not
   give unreviewed public pull-request code production credentials.
4. Deploy. In Supabase URL Configuration, set the Site URL to your production
   origin and add `https://YOUR_APP_DOMAIN/auth/callback` to allowed redirect URLs.
   Add any custom domain's exact callback too. Avoid broad production wildcards.
5. Complete the owner account bootstrap and disable new sign-ups as described
   above before sharing the deployed app.

Vercel supports the app's server rendering and API routes; use the
[Next.js framework guide](https://vercel.com/docs/frameworks/full-stack/nextjs).
The runtime selection is documented under
[supported Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).

## 6. Verify your deployment

- Confirm owner sign-in and sign-in again after disabling new account creation.
- Confirm another Google account is rejected and unauthenticated protected API
  requests return an authorization error.
- Browse while signed out. Confirm that public access to the displayed workout
  details is intentional before adding private notes or training records.
- In your new test instance, import starter data, log a workout, refresh during
  the session, and verify saves, completion, review, and the next-session draft.
- Verify Gemini access if enabled; check server logs for failures without logging
  complete prompts, workout payloads, keys, or authorization headers.
- Confirm RLS is enabled and the versioned policies/migrations were applied.

Local lint, types, tests, and builds are separate from these deployed checks.
Preparing the public source does not apply migrations or validate live services.
