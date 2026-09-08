"use client";

import { useState } from "react";
import { Download, Play, Trash2 } from "lucide-react";

import { useAppActivity, useTrackedRouter } from "@/components/ui/app-activity";
import { Button } from "@/components/ui/button";

export function ImportStarterButton() {
  const router = useTrackedRouter();
  const { fetchWithActivity } = useAppActivity();
  const [loading, setLoading] = useState(false);

  async function importStarter() {
    setLoading(true);
    await fetchWithActivity("Importing starter data...", "/api/templates/import", {
      method: "POST",
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <Button onClick={importStarter} disabled={loading} variant="secondary">
      <Download size={16} />
      {loading ? "Importing..." : "Import starter data"}
    </Button>
  );
}

export function ImportFullExerciseLibraryButton() {
  const router = useTrackedRouter();
  const { fetchWithActivity } = useAppActivity();
  const [loading, setLoading] = useState(false);

  async function importLibrary() {
    setLoading(true);
    await fetchWithActivity(
      "Importing exercise library...",
      "/api/exercises/import",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "full" }),
      },
    );
    setLoading(false);
    router.refresh();
  }

  return (
    <Button onClick={importLibrary} disabled={loading} variant="secondary">
      <Download size={16} />
      {loading ? "Importing..." : "Import full library"}
    </Button>
  );
}

export function StartTemplateButton({ templateId }: { templateId: string }) {
  return <StartSessionButton payload={{ templateId }} />;
}

export function StartSuggestionButton({ suggestionId }: { suggestionId: string }) {
  return <StartSessionButton payload={{ suggestionId }} />;
}

export function StartEmptySessionButton() {
  return <StartSessionButton payload={{ empty: true }} label="Start custom workout" />;
}

export function RemoveSuggestionButton({
  suggestionId,
  suggestionName,
}: {
  suggestionId: string;
  suggestionName: string;
}) {
  const router = useTrackedRouter();
  const { fetchWithActivity } = useAppActivity();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetchWithActivity(
        "Removing suggestion...",
        `/api/suggestions/${suggestionId}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        setError("Unable to remove this suggestion. Please try again.");
        return;
      }

      router.refresh();
    } catch {
      setError("Unable to remove this suggestion. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button
        aria-label={`Remove ${suggestionName} from list`}
        onClick={remove}
        disabled={loading}
        className="w-full"
        variant="secondary"
      >
        <Trash2 size={16} />
        {loading ? "Removing..." : "Remove from list"}
      </Button>
      {error ? (
        <p className="text-sm font-medium text-rose-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function StartSessionButton({
  payload,
  label = "Start",
}: {
  payload: { templateId: string } | { suggestionId: string } | { empty: true };
  label?: string;
}) {
  const router = useTrackedRouter();
  const { fetchWithActivity } = useAppActivity();
  const [loading, setLoading] = useState(false);

  async function start() {
    setLoading(true);
    const response = await fetchWithActivity(
      "Starting workout...",
      "/api/sessions/start",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const body = (await response.json()) as { session?: { id: string } };
    setLoading(false);

    if (body.session?.id) {
      router.push(`/sessions/${body.session.id}`);
    }
  }

  return (
    <Button onClick={start} disabled={loading} className="w-full">
      <Play size={16} />
      {loading ? "Starting..." : label}
    </Button>
  );
}
