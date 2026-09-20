"use client";

import { useState, type FormEvent } from "react";
import { Pencil } from "lucide-react";

import { useAppActivity, useTrackedRouter } from "@/components/ui/app-activity";

export function WeeklyWorkoutTargetEditor({ target }: { target: number }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(target));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { fetchWithActivity } = useAppActivity();
  const router = useTrackedRouter();

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextTarget = Number(draft);
    if (!Number.isInteger(nextTarget) || nextTarget < 1 || nextTarget > 14) {
      setError("Choose a whole number from 1 to 14.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await fetchWithActivity(
        "Saving weekly workout goal...",
        "/api/profile/weekly-workout-target",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target: nextTarget }),
        },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { message?: string } | null;
        setError(body?.message ?? "Unable to save the weekly goal.");
        return;
      }
      setEditing(false);
      router.refresh();
    } catch {
      setError("Unable to save the weekly goal. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
      {editing ? (
        <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => void save(event)}>
          <label className="min-w-0 flex-1 text-xs font-bold text-slate-700" htmlFor="weekly-workout-target">
            Workouts per week
            <input
              className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900"
              id="weekly-workout-target"
              inputMode="numeric"
              max={14}
              min={1}
              onChange={(event) => setDraft(event.target.value)}
              required
              step={1}
              type="number"
              value={draft}
            />
          </label>
          <button className="min-h-11 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white disabled:opacity-50" disabled={saving} type="submit">
            Save
          </button>
          <button
            className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700 disabled:opacity-50"
            disabled={saving}
            onClick={() => {
              setDraft(String(target));
              setError(null);
              setEditing(false);
            }}
            type="button"
          >
            Cancel
          </button>
          {error ? <p className="w-full text-xs font-semibold text-rose-700" role="alert">{error}</p> : null}
        </form>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold text-slate-600">Weekly goal: {target} {target === 1 ? "workout" : "workouts"}</p>
          <button
            aria-label="Edit weekly workout goal"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-xs font-bold text-emerald-700 hover:bg-emerald-50"
            onClick={() => {
              setDraft(String(target));
              setError(null);
              setEditing(true);
            }}
            type="button"
          >
            <Pencil size={14} /> Edit
          </button>
        </div>
      )}
    </section>
  );
}
