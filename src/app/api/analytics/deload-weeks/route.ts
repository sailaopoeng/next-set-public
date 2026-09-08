import { jsonError } from "@/lib/api";
import { authErrorResponse, requireAllowedUser } from "@/lib/auth/server";
import { deloadWeekRequestSchema } from "@/lib/validation/schemas";
import {
  formatSingaporeDateKey,
  getSundayWeekRangeSingapore,
} from "@/server/analytics/calculations";
import { removeDeloadWeek, setDeloadWeek } from "@/server/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
  return mutateDeloadWeek(request, true);
}

export async function DELETE(request: Request) {
  return mutateDeloadWeek(request, false);
}

async function mutateDeloadWeek(request: Request, active: boolean) {
  try {
    const { supabase, user } = await requireAllowedUser();
    const parsed = deloadWeekRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return jsonError(400, "BAD_DELOAD_WEEK", parsed.error.message);
    }
    const currentRange = getSundayWeekRangeSingapore();
    const current = formatSingaporeDateKey(currentRange.weekStart);
    const next = formatSingaporeDateKey(currentRange.weekEnd);
    if (parsed.data.weekStart !== current && parsed.data.weekStart !== next) {
      return jsonError(
        400,
        "BAD_DELOAD_WEEK",
        "Only the current or next Singapore week can be changed.",
      );
    }
    if (active) {
      await setDeloadWeek(
        supabase,
        user.id,
        parsed.data.weekStart,
        parsed.data.source,
      );
    } else {
      await removeDeloadWeek(supabase, user.id, parsed.data.weekStart);
    }
    return Response.json({ weekStart: parsed.data.weekStart, active });
  } catch (error) {
    return authErrorResponse(error);
  }
}
