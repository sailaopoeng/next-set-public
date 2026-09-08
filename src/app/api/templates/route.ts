import { jsonError } from "@/lib/api";
import {
  AuthError,
  authErrorResponse,
  requireAllowedUser,
} from "@/lib/auth/server";
import { templateUpdateSchema } from "@/lib/validation/schemas";
import { listTemplates } from "@/server/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { supabase, user } = await requireAllowedUser();
    return Response.json({ templates: await listTemplates(supabase, user.id) });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const { supabase } = await requireAllowedUser();
    const body = (await request.json()) as { id?: string };
    const parsed = templateUpdateSchema.safeParse(body);

    if (!body.id || !parsed.success) {
      return jsonError(400, "BAD_TEMPLATE", "Template payload is invalid.");
    }

    const template = parsed.data;
    const { error } = await supabase.rpc("replace_workout_template", {
      p_template_id: body.id,
      p_name: template.name,
      p_description: template.description,
      p_sort_order: template.sortOrder,
      p_is_active: template.isActive,
      p_exercises: template.exercises.map((exercise) => ({
        exercise_id: exercise.exerciseId,
        exercise_order: exercise.exerciseOrder,
        target_sets: exercise.targetSets,
        target_reps_min: exercise.targetRepsMin,
        target_reps_max: exercise.targetRepsMax,
        target_weight_kg: exercise.targetWeightKg,
        target_set_weights_kg: exercise.targetSetWeightsKg,
        rest_seconds: exercise.restSeconds,
        superset_group_id: exercise.supersetGroupId,
        notes: exercise.notes,
      })),
    });

    if (error) throw error;

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return authErrorResponse(error);
    }

    console.error("Template save failed.", error);
    return jsonError(
      500,
      "TEMPLATE_SAVE_FAILED",
      "Unable to save template. Your existing exercise list was preserved.",
    );
  }
}
