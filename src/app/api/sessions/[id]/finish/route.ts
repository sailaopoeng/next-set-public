import { jsonError } from "@/lib/api";
import { authErrorResponse, requireAllowedUser } from "@/lib/auth/server";
import { finishSessionSchema } from "@/lib/validation/schemas";
import { reviewAndSaveSession } from "@/server/ai/review";
import { finishSession, getSessionDetails } from "@/server/db/queries";
import { after } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { supabase, user } = await requireAllowedUser();
    const parsed = finishSessionSchema.safeParse(await request.json());

    if (!parsed.success) {
      return jsonError(400, "BAD_FINISH", parsed.error.message);
    }

    const completion = await finishSession(
      supabase,
      id,
      parsed.data.performedAt,
      parsed.data.notes,
    );

    if (completion.newlyCompleted) {
      after(async () => {
        try {
          const session = await getSessionDetails(supabase, user.id, id);
          await reviewAndSaveSession(supabase, user.id, session);
        } catch (error) {
          console.error("Unable to generate the post-workout review.", error);
        }
      });
    }

    return Response.json({
      session: completion.session,
      reviewPending: completion.newlyCompleted,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
