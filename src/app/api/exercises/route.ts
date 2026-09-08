import { jsonError } from "@/lib/api";
import { authErrorResponse, requireAllowedUser } from "@/lib/auth/server";
import { exerciseUpsertSchema } from "@/lib/validation/schemas";
import { listExercises } from "@/server/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { supabase, user } = await requireAllowedUser();
    return Response.json({ exercises: await listExercises(supabase, user.id) });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireAllowedUser();
    const parsed = exerciseUpsertSchema.safeParse(await request.json());

    if (!parsed.success) {
      return jsonError(400, "BAD_EXERCISE", parsed.error.message);
    }

    const exercise = parsed.data;
    const row = {
      ...(exercise.id ? { id: exercise.id } : {}),
      user_id: user.id,
      name: exercise.name,
      primary_muscle_group: exercise.primaryMuscleGroup,
      secondary_muscle_groups: exercise.secondaryMuscleGroups,
      equipment: exercise.equipment,
      lift_category: exercise.liftCategory,
      default_increment_kg: exercise.defaultIncrementKg,
      is_main_lift: exercise.isMainLift,
      is_ai_suggestion_enabled: exercise.isAiSuggestionEnabled,
      notes: exercise.notes,
      source: "manual",
      source_id: exercise.id ?? crypto.randomUUID(),
      source_license: "manual",
    };
    const { data, error } = await supabase.from("exercises").upsert(row).select("*").single();

    if (error) throw error;
    return Response.json({ exercise: data });
  } catch (error) {
    return authErrorResponse(error);
  }
}
