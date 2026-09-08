import { jsonError } from "@/lib/api";
import { authErrorResponse, requireAllowedUser } from "@/lib/auth/server";
import { exerciseReplacementApplySchema } from "@/lib/validation/schemas";
import { replaceSuggestionExercise } from "@/server/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; suggestionExerciseId: string }> },
) {
  try {
    const { id, suggestionExerciseId } = await context.params;
    const { supabase, user } = await requireAllowedUser();
    const parsed = exerciseReplacementApplySchema.safeParse(await request.json());

    if (!parsed.success) {
      return jsonError(400, "BAD_REPLACEMENT", parsed.error.message);
    }

    return Response.json({
      exercise: await replaceSuggestionExercise(
        supabase,
        user.id,
        id,
        suggestionExerciseId,
        parsed.data.replacementExerciseId,
        parsed.data.target,
      ),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
