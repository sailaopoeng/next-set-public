import { ExerciseManager } from "@/components/exercises/exercise-manager";
import { AppShell } from "@/components/layout/app-shell";
import { getPageViewer } from "@/lib/auth/server";
import { listExercises } from "@/server/db/queries";

export const dynamic = "force-dynamic";

export default async function ExercisesPage() {
  const { supabase, ownerId, isOwner } = await getPageViewer();
  const exercises = ownerId ? await listExercises(supabase, ownerId) : [];

  return (
    <AppShell isOwner={isOwner}>
      <div className="mb-5">
        <h1 className="text-xl font-bold tracking-tight">Exercises</h1>
        <p className="mt-1 text-sm text-slate-600">
          {isOwner
            ? "Search, import, and manually add exercises with muscle metadata."
            : "Browse exercises and their muscle metadata."}
        </p>
      </div>
      <ExerciseManager exercises={exercises} readOnly={!isOwner} />
    </AppShell>
  );
}
