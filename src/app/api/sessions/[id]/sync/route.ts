import { isUuid, jsonError, notFoundResponse, readJsonBody } from "@/lib/api";
import { authErrorResponse, requireAllowedUser } from "@/lib/auth/server";
import { liveSessionSyncSchema } from "@/lib/validation/schemas";
import { syncLiveSession } from "@/server/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { supabase } = await requireAllowedUser();
    if (!isUuid(id)) return notFoundResponse();
    const parsed = liveSessionSyncSchema.safeParse(await readJsonBody(request));

    if (!parsed.success) {
      return jsonError(400, "BAD_SESSION_SNAPSHOT", parsed.error.message);
    }

    return Response.json(await syncLiveSession(supabase, id, parsed.data));
  } catch (error) {
    return authErrorResponse(error);
  }
}
