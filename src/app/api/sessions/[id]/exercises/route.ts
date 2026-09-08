import { jsonError } from "@/lib/api";
import { authErrorResponse, requireAllowedUser } from "@/lib/auth/server";
import {
  exerciseOrderSchema,
  sessionExerciseAddSchema,
  sessionSupersetUpdateSchema,
} from "@/lib/validation/schemas";
import {
  addSessionExercise,
  reorderSessionExercises,
  replaceSessionSupersets,
} from "@/server/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { supabase, user } = await requireAllowedUser();
    const parsed = sessionExerciseAddSchema.safeParse(await request.json());

    if (!parsed.success) {
      return jsonError(400, "BAD_EXERCISE", parsed.error.message);
    }

    return Response.json({
      session: await addSessionExercise(
        supabase,
        user.id,
        id,
        parsed.data.exerciseId,
        parsed.data.sessionExerciseId,
        parsed.data.initialSetId,
      ),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { supabase, user } = await requireAllowedUser();
    const body = await request.json();
    const supersetParsed = sessionSupersetUpdateSchema.safeParse(body);

    if (supersetParsed.success) {
      return Response.json({
        session: await replaceSessionSupersets(
          supabase,
          user.id,
          id,
          supersetParsed.data.supersetGroups,
        ),
      });
    }

    const parsed = exerciseOrderSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError(400, "BAD_EXERCISE_ORDER", parsed.error.message);
    }

    return Response.json({
      session: await reorderSessionExercises(
        supabase,
        user.id,
        id,
        parsed.data.exerciseIds,
      ),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
