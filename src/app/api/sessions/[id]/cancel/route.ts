import { authErrorResponse, requireAllowedUser } from "@/lib/auth/server";
import { cancelSession } from "@/server/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { supabase, user } = await requireAllowedUser();

    await cancelSession(supabase, user.id, id);

    return Response.json({ cancelled: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
