import { authErrorResponse, requireAllowedUser } from "@/lib/auth/server";
import { exerciseReplacementApplySchema } from "@/lib/validation/schemas";
import { removeSessionExercise } from "@/server/db/queries";
import { replaceSessionExercise } from "@/server/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; sessionExerciseId: string }> },
) {
  try {
    const { id, sessionExerciseId } = await context.params;
    const { supabase, user } = await requireAllowedUser();
    const parsed = exerciseReplacementApplySchema.safeParse(await request.json());

    if (!parsed.success) {
      return Response.json(
        { error: "BAD_REPLACEMENT", message: parsed.error.message },
        { status: 400 },
      );
    }

    return Response.json({
      session: await replaceSessionExercise(
        supabase,
        user.id,
        id,
        sessionExerciseId,
        parsed.data.replacementExerciseId,
        parsed.data.target,
      ),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; sessionExerciseId: string }> },
) {
  try {
    const { id, sessionExerciseId } = await context.params;
    const { supabase, user } = await requireAllowedUser();

    return Response.json({
      session: await removeSessionExercise(
        supabase,
        user.id,
        id,
        sessionExerciseId,
      ),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
