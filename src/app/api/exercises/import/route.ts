import { jsonError } from "@/lib/api";
import { authErrorResponse, requireAllowedUser } from "@/lib/auth/server";
import {
  importFreeExerciseDb,
  importStarterData,
} from "@/server/exercise-import/importers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireAllowedUser();
    const body = (await request.json().catch(() => ({}))) as { mode?: string };

    if (body.mode === "full") {
      const result = await importFreeExerciseDb(supabase, user.id);
      return Response.json({ mode: "full", result });
    }

    if (body.mode && body.mode !== "starter") {
      return jsonError(400, "BAD_IMPORT_MODE", "Use starter or full.");
    }

    return Response.json({
      mode: "starter",
      result: await importStarterData(supabase, user.id),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
