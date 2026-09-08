import { jsonError } from "@/lib/api";
import { authErrorResponse, requireAllowedUser } from "@/lib/auth/server";
import { exerciseOrderSchema } from "@/lib/validation/schemas";
import { reorderSuggestionExercises } from "@/server/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { supabase, user } = await requireAllowedUser();
    const body = (await request.json()) as {
      status?: "accepted" | "draft";
      name?: string;
      rationale?: string | null;
      exerciseIds?: string[];
    };

    if (
      body.status &&
      !["accepted", "draft"].includes(body.status)
    ) {
      return jsonError(400, "BAD_STATUS", "Unsupported suggestion status.");
    }

    if (body.exerciseIds !== undefined) {
      const parsedOrder = exerciseOrderSchema.safeParse({
        exerciseIds: body.exerciseIds,
      });

      if (!parsedOrder.success) {
        return jsonError(400, "BAD_EXERCISE_ORDER", parsedOrder.error.message);
      }

      await reorderSuggestionExercises(
        supabase,
        user.id,
        id,
        parsedOrder.data.exerciseIds,
      );
    }

    if (
      body.status === undefined &&
      body.name === undefined &&
      body.rationale === undefined
    ) {
      return Response.json({ ok: true });
    }

    const { data, error } = await supabase
      .from("workout_suggestions")
      .update({
        ...(body.status ? { status: body.status } : {}),
        ...(body.name ? { name: body.name } : {}),
        ...(body.rationale !== undefined ? { rationale: body.rationale } : {}),
      })
      .eq("user_id", user.id)
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;

    return Response.json({ suggestion: data });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { supabase, user } = await requireAllowedUser();

    const { error } = await supabase
      .from("workout_suggestions")
      .delete()
      .eq("user_id", user.id)
      .eq("id", id);

    if (error) throw error;

    return Response.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
