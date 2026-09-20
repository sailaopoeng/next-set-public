import { AnalyticsDashboard } from "@/components/analytics/analytics-dashboard";
import { AppShell } from "@/components/layout/app-shell";
import { getPageViewer } from "@/lib/auth/server";
import {
  buildDashboardAnalytics,
  formatSingaporeDateKey,
  getSundayWeekRangeSingapore,
} from "@/server/analytics/calculations";
import {
  getProfilePreferences,
  listAnalyticsSessions,
  listDeloadWeeks,
  listWeeklyAnalyses,
} from "@/server/db/queries";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const { supabase, ownerId, isOwner } = await getPageViewer();
  const [sessions, preferences, analyses, deloadWeeks] = ownerId
    ? await Promise.all([
        listAnalyticsSessions(supabase, ownerId),
        getProfilePreferences(supabase, ownerId),
        listWeeklyAnalyses(supabase, ownerId),
        listDeloadWeeks(supabase, ownerId),
      ])
    : [[], null, [], []];

  return (
    <AppShell isOwner={isOwner} wide>
      <div className="mb-5">
        <h1 className="text-xl font-bold tracking-tight">Analytics</h1>
        <p className="mt-1 text-sm text-slate-600">
          Strength records, weekly muscle work, and recovery signals in Singapore time.
        </p>
      </div>
      <AnalyticsDashboard
        analyses={analyses}
        analytics={buildDashboardAnalytics(
          sessions,
          new Date(),
          preferences?.weeklyWorkoutTarget ?? 3,
          preferences?.weeklyMuscleTargets,
        )}
        deloadWeeks={deloadWeeks}
        isOwner={isOwner}
        sessionWeekStarts={[...new Set(sessions.map((session) =>
          formatSingaporeDateKey(
            getSundayWeekRangeSingapore(new Date(session.performed_at)).weekStart,
          ),
        ))]}
      />
    </AppShell>
  );
}
