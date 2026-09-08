import { jsonError } from "@/lib/api";
import { authErrorResponse, requireAllowedUser } from "@/lib/auth/server";
import { sessionMetadataUpdateSchema } from "@/lib/validation/schemas";
import { updateSessionMetadata } from "@/server/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { supabase, user } = await requireAllowedUser();
    const parsed = sessionMetadataUpdateSchema.safeParse(await request.json());

    if (!parsed.success) {
      return jsonError(400, "BAD_SESSION_UPDATE", parsed.error.message);
    }

    return Response.json({
      session: await updateSessionMetadata(
        supabase,
        user.id,
        id,
        parsed.data.performedAt,
        parsed.data.notes,
      ),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
