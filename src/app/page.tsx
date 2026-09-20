import { AppShell } from "@/components/layout/app-shell";
import { HomeDashboard } from "@/components/home/home-dashboard";
import { getPageViewer } from "@/lib/auth/server";
import { buildDashboardAnalytics } from "@/server/analytics/calculations";
import {
  findActiveSession,
  findLatestAcceptedSuggestion,
  getProfilePreferences,
  listCompletedSessionDetails,
  listRecentSessions,
  listTemplates,
} from "@/server/db/queries";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { supabase, ownerId, isOwner } = await getPageViewer();
  const [
    templates,
    recentSessions,
    completedSessions,
    acceptedSuggestion,
    preferences,
    activeSession,
  ] = ownerId
    ? await Promise.all([
        listTemplates(supabase, ownerId),
        listRecentSessions(supabase, ownerId),
        listCompletedSessionDetails(supabase, ownerId),
        findLatestAcceptedSuggestion(supabase, ownerId),
        getProfilePreferences(supabase, ownerId),
        findActiveSession(supabase, ownerId),
      ])
    : [[], [], [], null, null, null];
  const analytics = buildDashboardAnalytics(
    completedSessions,
    new Date(),
    preferences?.weeklyWorkoutTarget ?? 3,
    preferences?.weeklyMuscleTargets,
  );

  return (
    <AppShell isOwner={isOwner}>
      <HomeDashboard
        templates={templates}
        recentSessions={recentSessions}
        acceptedSuggestion={acceptedSuggestion}
        lastCompletedTemplateId={completedSessions[0]?.template_id ?? null}
        activeSession={activeSession}
        analytics={analytics}
        weeklyWorkoutTarget={preferences?.weeklyWorkoutTarget ?? 3}
        weeklyMuscleTargets={preferences?.weeklyMuscleTargets}
        isOwner={isOwner}
      />
    </AppShell>
  );
}
