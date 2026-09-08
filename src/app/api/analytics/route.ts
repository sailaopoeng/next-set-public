import { authErrorResponse, requireAllowedUser } from "@/lib/auth/server";
import { buildDashboardAnalytics } from "@/server/analytics/calculations";
import {
  getProfilePreferences,
  listAllCompletedSessionDetails,
} from "@/server/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { supabase, user } = await requireAllowedUser();
    const [sessions, preferences] = await Promise.all([
      listAllCompletedSessionDetails(supabase, user.id),
      getProfilePreferences(supabase, user.id),
    ]);

    return Response.json({
      analytics: buildDashboardAnalytics(
        sessions,
        new Date(),
        preferences.weeklyWorkoutTarget,
        preferences.weeklyMuscleTargets,
      ),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
