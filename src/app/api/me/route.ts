import { authErrorResponse, requireAllowedUser } from "@/lib/auth/server";
import { ensureProfile } from "@/server/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { supabase, user } = await requireAllowedUser();
    await ensureProfile(supabase, user);

    return Response.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.name ?? null,
      },
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
