"use client";

import { useState } from "react";
import { Dumbbell } from "lucide-react";

import { useAppActivity } from "@/components/ui/app-activity";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function LoginPanel({
  configured,
  emailNotAllowed = false,
}: {
  configured: boolean;
  emailNotAllowed?: boolean;
}) {
  const { runWithActivity } = useAppActivity();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const origin = window.location.origin;
      const { data, error: signInError } = await runWithActivity(
        "Opening Google sign-in...",
        async () => {
          const result = await supabase.auth.signInWithOAuth({
            provider: "google",
            options: {
              redirectTo: `${origin}/auth/callback`,
              skipBrowserRedirect: true,
              queryParams: {
                prompt: "select_account",
              },
            },
          });

          if (result.data.url) {
            // Leave one clear acknowledgement before the external OAuth navigation.
            await new Promise((resolve) => window.setTimeout(resolve, 200));
            window.location.assign(result.data.url);
          }

          return result;
        },
      );

      if (signInError) {
        setError(signInError.message);
      } else if (!data.url) {
        setError("Unable to open Google sign-in.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-100 px-4">
      <section className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-8 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm">
            <Dumbbell size={20} />
          </span>
          <div>
            <h1 className="text-xl font-bold tracking-tight">NextSet</h1>
            <p className="text-sm text-slate-500">Personal gym logger</p>
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              Sign in to log
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Sign-in is reserved for the site owner. Visitors can browse the
              app in read-only mode.
            </p>
          </div>
          {emailNotAllowed ? (
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
              This sign-in is reserved for the site owner. You are welcome to
              continue browsing in read-only mode.
            </div>
          ) : null}
          {!configured ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Supabase env vars are not configured yet. Add them to `.env.local`
              before testing login.
            </div>
          ) : null}
          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
              {error}
            </div>
          ) : null}
          <Button onClick={signIn} disabled={!configured || loading} className="h-12 w-full">
            {loading ? "Opening Google..." : "Continue with Google"}
          </Button>
        </div>
      </section>
    </main>
  );
}
