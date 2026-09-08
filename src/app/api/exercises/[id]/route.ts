import { jsonError } from "@/lib/api";
import { authErrorResponse, requireAllowedUser } from "@/lib/auth/server";
import { exerciseSettingsUpdateSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { supabase, user } = await requireAllowedUser();
    const parsed = exerciseSettingsUpdateSchema.safeParse(
      await request.json(),
    );

    if (!parsed.success) {
      return jsonError(400, "BAD_EXERCISE_SETTING", parsed.error.message);
    }

    const updates = {
      ...(parsed.data.isAiSuggestionEnabled !== undefined
        ? { is_ai_suggestion_enabled: parsed.data.isAiSuggestionEnabled }
        : {}),
      ...(parsed.data.volumeMultiplier !== undefined
        ? { volume_multiplier: parsed.data.volumeMultiplier }
        : {}),
    };

    const { data, error } = await supabase
      .from("exercises")
      .update(updates)
      .eq("user_id", user.id)
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;
    return Response.json({ exercise: data });
  } catch (error) {
    return authErrorResponse(error);
  }
}
