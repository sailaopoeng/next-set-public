import { jsonError } from "@/lib/api";
import { authErrorResponse, requireAllowedUser } from "@/lib/auth/server";
import { exerciseReplacementRequestSchema } from "@/lib/validation/schemas";
import { findExerciseReplacements } from "@/server/exercise-replacements/replacements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireAllowedUser();
    const parsed = exerciseReplacementRequestSchema.safeParse(await request.json());

    if (!parsed.success) {
      return jsonError(400, "BAD_REPLACEMENT_REQUEST", parsed.error.message);
    }

    const candidates = await findExerciseReplacements(
      supabase,
      user.id,
      parsed.data,
    );

    return Response.json({
      candidates: candidates.map((candidate) => ({
        exercise: candidate.exercise,
        target: candidate.target,
        reasonTags: candidate.reasonTags,
      })),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
