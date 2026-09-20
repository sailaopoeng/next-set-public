import { notFound } from "next/navigation";

import { ExerciseDetail } from "@/components/exercises/exercise-detail";
import { AppShell } from "@/components/layout/app-shell";
import { getPageViewer } from "@/lib/auth/server";
import { buildExerciseDetailAnalytics } from "@/server/analytics/calculations";
import {
  listCompletedSessionsForExercise,
  listExercises,
} from "@/server/db/queries";

export const dynamic = "force-dynamic";

export default async function ExerciseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, ownerId, isOwner } = await getPageViewer();

  if (!ownerId) notFound();

  const [exercises, sessions] = await Promise.all([
    listExercises(supabase, ownerId),
    listCompletedSessionsForExercise(supabase, ownerId, id),
  ]);
  const exercise = exercises.find((item) => item.id === id);

  if (!exercise) notFound();

  return (
    <AppShell isOwner={isOwner}>
      <ExerciseDetail
        exercise={exercise}
        analytics={buildExerciseDetailAnalytics(sessions, id)}
      />
    </AppShell>
  );
}
