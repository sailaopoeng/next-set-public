import { jsonError } from "@/lib/api";
import { authErrorResponse, requireAllowedUser } from "@/lib/auth/server";
import { weeklyWorkoutTargetUpdateSchema } from "@/lib/validation/schemas";
import { updateWeeklyWorkoutTarget } from "@/server/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  try {
    const { supabase, user } = await requireAllowedUser();
    const parsed = weeklyWorkoutTargetUpdateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return jsonError(400, "BAD_WEEKLY_WORKOUT_TARGET", parsed.error.message);
    }
    const target = await updateWeeklyWorkoutTarget(supabase, user.id, parsed.data.target);
    return Response.json({ target });
  } catch (error) {
    return authErrorResponse(error);
  }
}
