import { z } from "zod";

import { jsonError } from "@/lib/api";
import { authErrorResponse, requireAllowedUser } from "@/lib/auth/server";
import { findLatestCompletedSetsForExercise } from "@/server/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const excludeSessionIdSchema = z.string().uuid();

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const exerciseId = z.string().uuid().safeParse(id);
    if (!exerciseId.success) {
      return jsonError(400, "BAD_EXERCISE_ID", "Invalid exercise id.");
    }

    const excludeSessionId = excludeSessionIdSchema.safeParse(
      new URL(request.url).searchParams.get("excludeSessionId"),
    );
    if (!excludeSessionId.success) {
      return jsonError(
        400,
        "BAD_SESSION_ID",
        "A valid excludeSessionId is required.",
      );
    }

    const { supabase, user } = await requireAllowedUser();
    const previous = await findLatestCompletedSetsForExercise(
      supabase,
      user.id,
      exerciseId.data,
      excludeSessionId.data,
    );

    return Response.json({ previous });
  } catch (error) {
    return authErrorResponse(error);
  }
}
