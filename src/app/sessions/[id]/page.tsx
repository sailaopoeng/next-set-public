import type { Viewport } from "next";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { SessionLogger } from "@/components/session/session-logger";
import { getPageViewer } from "@/lib/auth/server";
import { findSessionDetails, listExercises } from "@/server/db/queries";

export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  interactiveWidget: "resizes-visual",
};

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, ownerId, isOwner } = await getPageViewer();

  if (!ownerId) notFound();

  const [session, exercises] = await Promise.all([
    findSessionDetails(supabase, ownerId, id),
    isOwner ? listExercises(supabase, ownerId) : Promise.resolve([]),
  ]);

  if (!session) notFound();

  return (
    <AppShell
      isOwner={isOwner}
      hideMobileNav={isOwner && session.status === "active"}
    >
      <SessionLogger
        session={session}
        exercises={exercises}
        readOnly={!isOwner}
      />
    </AppShell>
  );
}
