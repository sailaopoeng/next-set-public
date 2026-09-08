import {
  SuggestionExerciseList,
  type SuggestionExercise,
} from "@/components/ai/suggestion-exercise-list";
import { AppShell } from "@/components/layout/app-shell";
import {
  ImportStarterButton,
  RemoveSuggestionButton,
  StartEmptySessionButton,
  StartSuggestionButton,
  StartTemplateButton,
} from "@/components/ui/action-buttons";
import { AppLink } from "@/components/ui/app-activity";
import { getPageViewer } from "@/lib/auth/server";
import { listTemplates } from "@/server/db/queries";

export const dynamic = "force-dynamic";

export default async function NewSessionPage() {
  const { supabase, ownerId, isOwner } = await getPageViewer();
  const templates = ownerId ? await listTemplates(supabase, ownerId) : [];
  const { data: suggestions } = ownerId
    ? await supabase
        .from("workout_suggestions")
        .select("*, workout_suggestion_exercises(*, exercise:exercises(*))")
        .eq("user_id", ownerId)
        .in("status", ["draft", "accepted"])
        .order("created_at", { ascending: false })
        .limit(5)
    : { data: [] };

  return (
    <AppShell isOwner={isOwner}>
      <div className="mb-5">
        <h1 className="text-xl font-bold tracking-tight">
          {isOwner ? "Start session" : "Workout plans"}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {isOwner
            ? "Pick a template or use the latest AI suggestion."
            : "View the available templates and latest AI suggestions."}
        </p>
      </div>
      {isOwner ? (
        <section className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <h2 className="font-bold">Log without a template</h2>
          <p className="mb-3 mt-1 text-sm text-slate-600">
            Start empty and add exercises while you train.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <StartEmptySessionButton />
            <AppLink
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-emerald-200 bg-white px-4 text-sm font-bold text-emerald-800 hover:bg-emerald-50"
              href="/sessions/prepare"
            >
              Prepare next session
            </AppLink>
          </div>
        </section>
      ) : null}
      {templates.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-4">
          <p className="text-sm text-slate-600">
            Import starter templates before starting your first session.
          </p>
          {isOwner ? (
            <div className="mt-3">
              <ImportStarterButton />
            </div>
          ) : null}
        </section>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          {templates.map((template) => (
            <article
              className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              key={template.id}
            >
              <h2 className="text-base font-bold">{template.name}</h2>
              <p className="mb-4 mt-1 flex-1 text-sm text-slate-600">
                {template.description}
              </p>
              {isOwner ? (
                <StartTemplateButton templateId={template.id} />
              ) : null}
            </article>
          ))}
        </div>
      )}

      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-bold">AI suggestions</h2>
        <p className="mt-1 text-sm text-slate-600">
          Accepted suggestions can be started or removed from this list.
        </p>
        <div className="mt-3 space-y-2">
          {(suggestions ?? []).length === 0 ? (
            <p className="text-sm text-slate-600">
              Finish a session to generate editable next-session suggestions.
            </p>
          ) : (
            (suggestions ?? []).map((suggestion) => (
              <article
                className="rounded-2xl border border-slate-200 p-3.5"
                key={suggestion.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-bold">{suggestion.name}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold capitalize ${
                        suggestion.status === "accepted"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-100 text-slate-600"
                      }`}>
                        {suggestion.status}
                      </span>
                      {suggestion.estimated_duration_minutes != null ? (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                          {suggestion.target_session_type === "sunday"
                            ? "Sunday"
                            : "Weekday"}{" "}
                          · {suggestion.estimated_duration_minutes} min
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <AppLink
                    className="shrink-0 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700"
                    href={`/sessions/${suggestion.source_session_id}/review`}
                  >
                    Review
                  </AppLink>
                </div>
                <div className="mt-3">
                  <SuggestionExerciseList
                    initialExercises={
                      (suggestion.workout_suggestion_exercises ??
                        []) as SuggestionExercise[]
                    }
                    suggestionId={suggestion.id}
                    readOnly={!isOwner}
                  />
                </div>
                {isOwner ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <StartSuggestionButton suggestionId={suggestion.id} />
                    <RemoveSuggestionButton
                      suggestionId={suggestion.id}
                      suggestionName={suggestion.name}
                    />
                  </div>
                ) : null}
              </article>
            ))
          )}
        </div>
      </section>
    </AppShell>
  );
}
