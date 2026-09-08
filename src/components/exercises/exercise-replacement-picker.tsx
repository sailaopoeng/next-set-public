"use client";

import { useState } from "react";
import { RefreshCw, Replace, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAppActivity } from "@/components/ui/app-activity";
import type { Exercise } from "@/lib/domain";

export type ReplacementTarget = {
  sets: number;
  repsMin: number;
  repsMax: number;
  weightKg: number | null;
  restSeconds: number;
  notes: string | null;
};

export type ReplacementCandidate = {
  exercise: Exercise;
  target: ReplacementTarget;
  reasonTags: string[];
};

export function ExerciseReplacementPicker({
  sourceExerciseId,
  excludeExerciseIds,
  currentTarget,
  contextType,
  disabled = false,
  onChoose,
}: {
  sourceExerciseId: string;
  excludeExerciseIds: string[];
  currentTarget: ReplacementTarget;
  contextType: "session" | "suggestion" | "prep";
  disabled?: boolean;
  onChoose: (candidate: ReplacementCandidate) => Promise<void>;
}) {
  const { fetchWithActivity } = useAppActivity();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [choosingExerciseId, setChoosingExerciseId] = useState<string | null>(null);
  const [seenExerciseIds, setSeenExerciseIds] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<ReplacementCandidate[]>([]);
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <Button
        className="min-h-8 rounded-full px-2.5 text-xs"
        disabled={disabled || loading}
        onClick={() => {
          if (open) {
            close();
            return;
          }
          setOpen(true);
          void loadCandidates([]);
        }}
        type="button"
        variant="ghost"
      >
        <Replace size={14} />
        Replace
      </Button>
      {open ? (
        <div className="mt-2 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm font-bold text-slate-800">
              Replacement options
            </div>
            <button
              aria-label="Close replacement options"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-white"
              onClick={close}
              type="button"
            >
              <X size={16} />
            </button>
          </div>
          {loading ? (
            <p className="text-sm text-slate-600">Finding similar exercises...</p>
          ) : null}
          {error ? (
            <p className="rounded-xl bg-rose-50 p-2 text-sm font-medium text-rose-700">
              {error}
            </p>
          ) : null}
          {!loading && candidates.length === 0 && !error ? (
            <p className="text-sm text-slate-600">
              No more similar exercises found in your library.
            </p>
          ) : null}
          <div className="space-y-2">
            {candidates.map((candidate) => (
              <article
                className="rounded-xl border border-slate-200 bg-white p-3"
                key={candidate.exercise.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-bold">{candidate.exercise.name}</div>
                    <div className="mt-0.5 text-xs font-medium text-slate-500">
                      {candidate.exercise.primary_muscle_group} /{" "}
                      {candidate.exercise.equipment ?? "equipment optional"}
                    </div>
                  </div>
                  <Button
                    className="min-h-10 px-3"
                    disabled={choosingExerciseId !== null}
                    onClick={() => void choose(candidate)}
                    type="button"
                  >
                    {choosingExerciseId === candidate.exercise.id
                      ? "Choosing..."
                      : "Choose"}
                  </Button>
                </div>
                <div className="mt-2 text-sm font-medium text-slate-700">
                  {candidate.target.sets} x {candidate.target.repsMin}
                  -{candidate.target.repsMax}
                  {candidate.target.weightKg !== null
                    ? ` @ ${candidate.target.weightKg}kg`
                    : ""}{" "}
                  / rest {candidate.target.restSeconds}s
                </div>
                {candidate.reasonTags.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {candidate.reasonTags.slice(0, 3).map((tag) => (
                      <span
                        className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600"
                        key={tag}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button
              disabled={loading}
              onClick={() => void loadCandidates(candidates.map((item) => item.exercise.id))}
              type="button"
              variant="secondary"
            >
              <RefreshCw size={16} />
              More
            </Button>
            <Button onClick={close} type="button" variant="ghost">
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );

  async function loadCandidates(additionalSeen: string[]) {
    const nextSeen = [...seenExerciseIds, ...additionalSeen];
    setLoading(true);
    setError(null);
    try {
      const response = await fetchWithActivity(
        "Finding replacements...",
        "/api/exercise-replacements",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceExerciseId,
            excludeExerciseIds,
            seenExerciseIds: nextSeen,
            currentTarget,
            contextType,
          }),
        },
      );

      if (!response.ok) throw new Error("Replacement request failed.");
      const body = (await response.json()) as {
        candidates?: ReplacementCandidate[];
      };
      setCandidates(body.candidates ?? []);
      setSeenExerciseIds(nextSeen);
    } catch {
      setError("Unable to find replacements. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function choose(candidate: ReplacementCandidate) {
    setChoosingExerciseId(candidate.exercise.id);
    setError(null);
    try {
      await onChoose(candidate);
      close();
    } catch {
      setError("Unable to replace this exercise. Please try again.");
    } finally {
      setChoosingExerciseId(null);
    }
  }

  function close() {
    setOpen(false);
    setCandidates([]);
    setSeenExerciseIds([]);
    setError(null);
  }
}
