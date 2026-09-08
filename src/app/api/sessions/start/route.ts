import { jsonError } from "@/lib/api";
import { authErrorResponse, requireAllowedUser } from "@/lib/auth/server";
import { startSessionSchema } from "@/lib/validation/schemas";
import {
  startEmptySession,
  startPreparedSession,
  startSessionFromSuggestion,
  startSessionFromTemplate,
} from "@/server/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireAllowedUser();
    const parsed = startSessionSchema.safeParse(await request.json());

    if (!parsed.success) {
      return jsonError(400, "BAD_SESSION_START", parsed.error.message);
    }

    const session =
      "empty" in parsed.data
        ? await startEmptySession(supabase, user.id)
        : "prepared" in parsed.data
          ? await startPreparedSession(supabase, user.id, parsed.data.prepared)
          : "suggestionId" in parsed.data
            ? await startSessionFromSuggestion(
                supabase,
                user.id,
                parsed.data.suggestionId,
              )
            : await startSessionFromTemplate(
                supabase,
                user.id,
                parsed.data.templateId,
              );

    return Response.json({ session });
  } catch (error) {
    return authErrorResponse(error);
  }
}
