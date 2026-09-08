import { jsonError } from "@/lib/api";
import { authErrorResponse, requireAllowedUser } from "@/lib/auth/server";
import { coachRequestSchema } from "@/lib/validation/schemas";
import { generateCoachWorkout } from "@/server/ai/coach";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireAllowedUser();
    const parsed = coachRequestSchema.safeParse(await request.json());

    if (!parsed.success) {
      return jsonError(400, "BAD_COACH_REQUEST", parsed.error.message);
    }

    const workout = await generateCoachWorkout(
      supabase,
      user.id,
      parsed.data,
    );

    return Response.json({ workout });
  } catch (error) {
    return authErrorResponse(error);
  }
}
