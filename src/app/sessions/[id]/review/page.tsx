import { notFound } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { ReviewPanel } from "@/components/ai/review-panel";
import { ReadOnlySession } from "@/components/session/read-only-session";
import { getPageViewer } from "@/lib/auth/server";
import { findSessionDetails } from "@/server/db/queries";

export const dynamic = "force-dynamic";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, ownerId, isOwner } = await getPageViewer();

  if (!ownerId) notFound();

  const session = await findSessionDetails(supabase, ownerId, id);

  if (!session) notFound();

  const { data: review } = await supabase
    .from("ai_reviews")
    .select("*, ai_exercise_decisions(*)")
    .eq("user_id", ownerId)
    .eq("session_id", id)
    .maybeSingle();
  const { data: suggestion } = await supabase
    .from("workout_suggestions")
    .select("*, workout_suggestion_exercises(*, exercise:exercises(*))")
    .eq("user_id", ownerId)
    .eq("source_session_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <AppShell isOwner={isOwner}>
      <div className="space-y-4">
        <ReadOnlySession session={session} />
        <ReviewPanel
          sessionId={id}
          summary={review?.summary ?? null}
          decisions={review?.ai_exercise_decisions ?? []}
          suggestion={suggestion ?? null}
          readOnly={!isOwner}
        />
      </div>
    </AppShell>
  );
}
