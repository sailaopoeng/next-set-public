import { notFound } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { PreparedSessionEditor } from "@/components/session/prepared-session-editor";
import { getPageViewer } from "@/lib/auth/server";
import { listExercises, listTemplates } from "@/server/db/queries";

export const dynamic = "force-dynamic";

export default async function PrepareSessionPage() {
  const { supabase, ownerId, isOwner } = await getPageViewer();

  if (!ownerId) notFound();

  const [exercises, templates] = isOwner
    ? await Promise.all([
        listExercises(supabase, ownerId),
        listTemplates(supabase, ownerId),
      ])
    : [[], []];

  return (
    <AppShell isOwner={isOwner}>
      {isOwner ? (
        <PreparedSessionEditor
          exercises={exercises}
          templates={templates}
          userId={ownerId}
        />
      ) : (
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
          Prepared sessions are only available to the owner.
        </p>
      )}
    </AppShell>
  );
}
