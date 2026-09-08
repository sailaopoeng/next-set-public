import { authErrorResponse, requireAllowedUser } from "@/lib/auth/server";
import { reviewAndSaveSession } from "@/server/ai/review";
import { getSessionDetails } from "@/server/db/queries";
import { after } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { supabase, user } = await requireAllowedUser();
    const { data, error } = await supabase
      .from("ai_reviews")
      .select("*, ai_exercise_decisions(*)")
      .eq("user_id", user.id)
      .eq("session_id", id)
      .maybeSingle();

    if (error) throw error;
    return Response.json({ review: data });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { supabase, user } = await requireAllowedUser();
    after(async () => {
      try {
        const session = await getSessionDetails(supabase, user.id, id);
        await reviewAndSaveSession(supabase, user.id, session);
      } catch (error) {
        console.error("Unable to regenerate the post-workout review.", error);
      }
    });

    return Response.json({ reviewPending: true }, { status: 202 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
