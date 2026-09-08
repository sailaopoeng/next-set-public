"use client";

import { useEffect, useState } from "react";

import {
  SuggestionExerciseList,
  type SuggestionExercise,
} from "@/components/ai/suggestion-exercise-list";
import { Button } from "@/components/ui/button";
import { StartSuggestionButton } from "@/components/ui/action-buttons";
import { useAppActivity, useTrackedRouter } from "@/components/ui/app-activity";

type Decision = {
  id: string;
  exercise_name: string;
  decision: string;
  reason: string;
  suggested_sets: number;
  suggested_reps_min: number;
  suggested_reps_max: number;
  suggested_weight_kg: number | null;
};

type Suggestion = {
  id: string;
  name: string;
  rationale: string | null;
  weekly_balance_notes?: string[];
  estimated_duration_minutes?: number | null;
  target_session_type?: "weekday" | "sunday" | null;
  status: string;
  workout_suggestion_exercises?: SuggestionExercise[];
};

export function ReviewPanel({
  sessionId,
  summary,
  decisions,
  suggestion,
  readOnly = false,
}: {
  sessionId: string;
  summary: string | null;
  decisions: Decision[];
  suggestion: Suggestion | null;
  readOnly?: boolean;
}) {
  const { refresh } = useTrackedRouter();
  const { fetchWithActivity } = useAppActivity();
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(summary === null && !readOnly);

  useEffect(() => {
    if (readOnly || summary || !polling) return;

    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    async function checkForReview() {
      attempts += 1;
      try {
        const response = await fetch(`/api/sessions/${sessionId}/review`);
        const body = (await response.json()) as { review?: unknown };
        if (response.ok && body.review) {
          if (!cancelled) {
            setPolling(false);
            refresh();
          }
          return;
        }
      } catch {
        // A later poll or a manual retry can recover from a transient failure.
      }

      if (!cancelled && attempts < 30) {
        timeout = setTimeout(checkForReview, 2000);
      } else if (!cancelled) {
        setPolling(false);
      }
    }

    timeout = setTimeout(checkForReview, 750);
    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [polling, readOnly, refresh, sessionId, summary]);

  async function retry() {
    setLoading(true);
    try {
      const response = await fetchWithActivity(
        "Starting review...",
        `/api/sessions/${sessionId}/review`,
        { method: "POST" },
      );
      if (response.ok) setPolling(true);
    } finally {
      setLoading(false);
    }
  }

  async function acceptSuggestion() {
    if (!suggestion) return;
    setLoading(true);
    await fetchWithActivity(
      "Accepting suggestion...",
      `/api/suggestions/${suggestion.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "accepted" }),
      },
    );
    setLoading(false);
    refresh();
  }

  async function deleteSuggestion() {
    if (!suggestion) return;
    setLoading(true);
    await fetchWithActivity(
      "Removing suggestion...",
      `/api/suggestions/${suggestion.id}`,
      { method: "DELETE" },
    );
    setLoading(false);
    refresh();
  }

  return (
    <div className="space-y-3">
      <section
        className="scroll-mt-20 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        id="ai-review"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight">AI review</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {summary ??
                (polling
                  ? "Your workout is saved. The review is being generated in the background…"
                  : "No review saved yet. Retry to generate one.")}
            </p>
          </div>
          {!readOnly ? (
            <Button onClick={retry} disabled={loading || polling} variant="secondary">
              {loading || polling ? "Generating…" : "Retry"}
            </Button>
          ) : null}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-bold">Progression decisions</h2>
        <div className="mt-3 space-y-2">
          {decisions.length === 0 ? (
            <p className="text-sm text-slate-600">No decisions yet.</p>
          ) : (
            decisions.map((decision) => (
              <div
                className="rounded-2xl border border-slate-200 p-3"
                key={decision.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-bold">{decision.exercise_name}</div>
                    <p className="mt-1 text-sm text-slate-600">{decision.reason}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold capitalize text-emerald-700">
                    {decision.decision}
                  </span>
                </div>
                <div className="mt-2 text-sm font-semibold tabular-nums text-slate-500">
                  Next: {decision.suggested_sets} x {decision.suggested_reps_min}
                  -{decision.suggested_reps_max}
                  {decision.suggested_weight_kg !== null
                    ? ` @ ${decision.suggested_weight_kg}kg`
                    : ""}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-bold">Next session suggestion</h2>
        {suggestion ? (
          <div className="mt-3 space-y-3">
            <div className="rounded-2xl bg-slate-50 p-3.5">
              <div className="font-bold">{suggestion.name}</div>
              <p className="mt-1 text-sm text-slate-600">
                {suggestion.rationale ??
                  (readOnly ? "Draft suggestion." : "Editable draft suggestion.")}
              </p>
              {suggestion.estimated_duration_minutes !== null &&
              suggestion.estimated_duration_minutes !== undefined ? (
                <p className="mt-2 text-sm font-semibold text-slate-700">
                  {formatSessionType(suggestion.target_session_type)} /{" "}
                  {suggestion.estimated_duration_minutes} min total
                </p>
              ) : null}
              {(suggestion.weekly_balance_notes ?? []).length > 0 ? (
                <div className="mt-3 space-y-1 rounded-xl bg-white p-2.5 text-sm text-slate-600">
                  {(suggestion.weekly_balance_notes ?? []).map((note) => (
                    <p key={note}>{note}</p>
                  ))}
                </div>
              ) : null}
              <div className="mt-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {suggestion.status}
              </div>
              {suggestion.status === "accepted" ? (
                <p className="mt-2 text-sm text-slate-600">
                  This is now listed on Start session until you start it.
                </p>
              ) : null}
            </div>
            <SuggestionExerciseList
              key={suggestion.id}
              initialExercises={suggestion.workout_suggestion_exercises ?? []}
              suggestionId={suggestion.id}
              readOnly={readOnly}
            />
            {!readOnly ? (
              <div className="grid gap-2 sm:grid-cols-3">
                <Button
                  onClick={acceptSuggestion}
                  disabled={loading}
                >
                  Accept
                </Button>
                <Button
                  onClick={deleteSuggestion}
                  disabled={loading}
                  variant="secondary"
                >
                  Ignore
                </Button>
                {suggestion.status === "accepted" ? (
                  <StartSuggestionButton suggestionId={suggestion.id} />
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-600">No suggestion saved yet.</p>
        )}
      </section>
    </div>
  );
}

function formatSessionType(value?: "weekday" | "sunday" | null) {
  return value === "sunday" ? "Sunday session" : "Weekday session";
}
