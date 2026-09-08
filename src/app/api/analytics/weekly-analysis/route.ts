import { jsonError } from "@/lib/api";
import { authErrorResponse, requireAllowedUser } from "@/lib/auth/server";
import { weeklyAnalysisRequestSchema } from "@/lib/validation/schemas";
import { generateAndSaveWeeklyAnalysis } from "@/server/ai/weekly-analysis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireAllowedUser();
    const parsed = weeklyAnalysisRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return jsonError(400, "BAD_WEEKLY_ANALYSIS_REQUEST", parsed.error.message);
    }
    try {
      const analysis = await generateAndSaveWeeklyAnalysis(
        supabase,
        user.id,
        parsed.data.weekStart,
      );
      return Response.json({ analysis });
    } catch (error) {
      if (error instanceof Error && error.message.includes("non-future Sunday")) {
        return jsonError(400, "BAD_WEEK_START", error.message);
      }
      throw error;
    }
  } catch (error) {
    return authErrorResponse(error);
  }
}
