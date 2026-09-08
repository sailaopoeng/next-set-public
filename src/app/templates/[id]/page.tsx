import { notFound } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { TemplateEditor } from "@/components/templates/template-editor";
import { TemplateReadOnly } from "@/components/templates/template-read-only";
import { AppLink } from "@/components/ui/app-activity";
import { getPageViewer } from "@/lib/auth/server";
import { findTemplate, listExercises } from "@/server/db/queries";

export const dynamic = "force-dynamic";

export default async function TemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, ownerId, isOwner } = await getPageViewer();

  if (!ownerId) notFound();

  const [template, exercises] = await Promise.all([
    findTemplate(supabase, ownerId, id),
    isOwner ? listExercises(supabase, ownerId) : Promise.resolve([]),
  ]);

  if (!template) notFound();

  return (
    <AppShell isOwner={isOwner}>
      <div className="mb-5">
        <AppLink className="text-sm font-bold text-emerald-700" href="/templates">
          Templates
        </AppLink>
        <h1 className="mt-2 text-xl font-bold tracking-tight">
          {isOwner ? "Edit" : "View"} {template.name}
        </h1>
      </div>
      {isOwner ? (
        <TemplateEditor template={template} exercises={exercises} />
      ) : (
        <TemplateReadOnly template={template} />
      )}
    </AppShell>
  );
}
