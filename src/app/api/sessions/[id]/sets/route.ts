import { jsonError } from "@/lib/api";
import { authErrorResponse, requireAllowedUser } from "@/lib/auth/server";
import { sessionSetAddSchema, setUpsertSchema } from "@/lib/validation/schemas";
import {
  addSessionSet,
  removeSessionSet,
  upsertSessionSets,
} from "@/server/db/queries";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { supabase, user } = await requireAllowedUser();
    const parsed = setUpsertSchema.safeParse(await request.json());

    if (!parsed.success) {
      return jsonError(400, "BAD_SETS", parsed.error.message);
    }

    return Response.json({
      sets: await upsertSessionSets(supabase, user.id, id, parsed.data.sets),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { supabase, user } = await requireAllowedUser();
    const parsed = sessionSetAddSchema.safeParse(await request.json());

    if (!parsed.success) {
      return jsonError(400, "BAD_SET", parsed.error.message);
    }

    return Response.json({
      session: await addSessionSet(
        supabase,
        user.id,
        id,
        parsed.data.sessionExerciseId,
        parsed.data.setId,
        parsed.data.partnerSetId,
      ),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { supabase, user } = await requireAllowedUser();
    const url = new URL(request.url);
    const setId = url.searchParams.get("setId");

    const parsedSetId = z.string().uuid().safeParse(setId);
    if (!parsedSetId.success) {
      return jsonError(400, "BAD_SET_ID", "setId must be a UUID.");
    }

    return Response.json({
      session: await removeSessionSet(supabase, user.id, id, parsedSetId.data),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
