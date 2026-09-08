import { jsonError } from "@/lib/api";
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
    const parsed = liveSessionSyncSchema.safeParse(await request.json());

    if (!parsed.success) {
      return jsonError(400, "BAD_SESSION_SNAPSHOT", parsed.error.message);
    }

    return Response.json(await syncLiveSession(supabase, id, parsed.data));
  } catch (error) {
    return authErrorResponse(error);
  }
}
