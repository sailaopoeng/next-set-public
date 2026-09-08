import { jsonError } from "@/lib/api";
import { authErrorResponse, requireAllowedUser } from "@/lib/auth/server";
import { weeklyMuscleTargetsUpdateSchema } from "@/lib/validation/schemas";
import { updateWeeklyMuscleTargets } from "@/server/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  try {
    const { supabase, user } = await requireAllowedUser();
    const parsed = weeklyMuscleTargetsUpdateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return jsonError(400, "BAD_WEEKLY_TARGETS", parsed.error.message);
    }
    const targets = await updateWeeklyMuscleTargets(supabase, user.id, parsed.data);
    return Response.json({ targets });
  } catch (error) {
    return authErrorResponse(error);
  }
}
