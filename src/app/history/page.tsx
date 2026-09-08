import { AppShell } from "@/components/layout/app-shell";
import { SessionSummaryCard } from "@/components/session/session-summary-card";
import { getPageViewer } from "@/lib/auth/server";
import { listRecentSessions } from "@/server/db/queries";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const { supabase, ownerId, isOwner } = await getPageViewer();
  const sessions = ownerId ? await listRecentSessions(supabase, ownerId, 50) : [];

  return (
    <AppShell isOwner={isOwner}>
      <div className="mb-5">
        <h1 className="text-xl font-bold tracking-tight">History</h1>
        <p className="mt-1 text-sm text-slate-600">
          Recent active and completed workout sessions.
        </p>
      </div>
      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="space-y-2">
          {sessions.length === 0 ? (
            <p className="p-1 text-sm text-slate-600">No sessions yet.</p>
          ) : (
            sessions.map((session) => (
              <SessionSummaryCard
                isOwner={isOwner}
                key={session.id}
                session={session}
              />
            ))
          )}
        </div>
      </section>
    </AppShell>
  );
}
