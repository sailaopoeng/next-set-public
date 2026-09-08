import { authErrorResponse, requireAllowedUser } from "@/lib/auth/server";
import { importStarterData } from "@/server/exercise-import/importers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const { supabase, user } = await requireAllowedUser();
    return Response.json({
      result: await importStarterData(supabase, user.id),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
