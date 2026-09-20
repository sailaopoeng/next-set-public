import { Fragment, type ReactNode } from "react";
import { BarChart3, CalendarCheck, Dumbbell, Flame } from "lucide-react";

import { MuscleProgressCard } from "@/components/home/muscle-progress-card";
import { WeeklyWorkoutTargetEditor } from "@/components/home/weekly-workout-target-editor";
import { orderHomeWorkoutTemplates } from "@/components/home/template-order";
import { ResumeSessionCard } from "@/components/session/resume-session-card";
import { SessionSummaryCard } from "@/components/session/session-summary-card";
import {
  ImportStarterButton,
  StartEmptySessionButton,
  StartSuggestionButton,
  StartTemplateButton,
} from "@/components/ui/action-buttons";
import { AppLink } from "@/components/ui/app-activity";
import type {
  Exercise,
  SessionWithDetails,
  WorkoutTemplate,
  WorkoutSuggestion,
} from "@/lib/domain";
import type { DashboardAnalytics } from "@/server/analytics/calculations";
import {
  DEFAULT_WEEKLY_MUSCLE_TARGET_SETTINGS,
  type WeeklyMuscleTargetSettings,
} from "@/lib/weekly-targets";

type TemplateWithExercises = WorkoutTemplate & {
  workout_template_exercises?: ExerciseNameItem[];
};

type SuggestionWithExercises = WorkoutSuggestion & {
  workout_suggestion_exercises?: ExerciseNameItem[];
};

type ExerciseNameItem = {
  exercise: Pick<Exercise, "name">;
};

export function HomeDashboard({
  templates,
  recentSessions,
  acceptedSuggestion,
  lastCompletedTemplateId,
  activeSession,
  analytics,
  weeklyWorkoutTarget,
  weeklyMuscleTargets = DEFAULT_WEEKLY_MUSCLE_TARGET_SETTINGS,
  isOwner,
}: {
  templates: TemplateWithExercises[];
  recentSessions: SessionWithDetails[];
  acceptedSuggestion: SuggestionWithExercises | null;
  lastCompletedTemplateId: string | null;
  activeSession: SessionWithDetails | null;
  analytics: DashboardAnalytics;
  weeklyWorkoutTarget: number;
  weeklyMuscleTargets?: WeeklyMuscleTargetSettings;
  isOwner: boolean;
}) {
  const today = new Date();
  const orderedTemplates = orderHomeWorkoutTemplates(
    templates,
    today,
    lastCompletedTemplateId,
  );

  return (
    <div className="space-y-4">
      {activeSession ? (
        <ResumeSessionCard isOwner={isOwner} session={activeSession} />
      ) : null}
      <section className="grid grid-cols-4 gap-2 md:gap-3">
        <MetricCard
          icon={<CalendarCheck size={16} />}
          label="This week"
          value={`${analytics.weeklyWorkoutCount}/${weeklyWorkoutTarget}`}
        />
        <MetricCard
          icon={<Dumbbell size={16} />}
          label="Sets"
          value={String(analytics.totalSets)}
        />
        <MetricCard
          icon={<BarChart3 size={16} />}
          label="Volume"
          value={`${Math.round(analytics.totalVolume)}kg`}
        />
        <MetricCard
          icon={<Flame size={16} />}
          label="Streak"
          value={`${analytics.weeklyTargetStreak}w`}
        />
      </section>
      {isOwner ? <WeeklyWorkoutTargetEditor target={weeklyWorkoutTarget} /> : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              {isOwner ? "Next workout" : "Workout templates"}
            </h1>
            {!isOwner ? (
              <p className="mt-1 text-sm text-slate-600">
                Browse full-body templates and logged workout activity.
              </p>
            ) : null}
          </div>
          <AppLink className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700" href="/templates">
            {isOwner ? "Edit" : "View"}
          </AppLink>
        </div>
        {isOwner && templates.length === 0 ? (
          <CustomWorkoutCard className="mb-4" />
        ) : null}
        {templates.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 p-4">
            <p className="text-sm text-slate-600">
              Import the starter full-body A/B/C templates to begin.
            </p>
            {isOwner ? (
              <div className="mt-3">
                <ImportStarterButton />
              </div>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {orderedTemplates.map((template, index) => (
              <Fragment key={template.id}>
                <TemplateCard isOwner={isOwner} template={template} />
                {isOwner && index === 0 ? (
                  <>
                    {acceptedSuggestion ? (
                      <SuggestionCard suggestion={acceptedSuggestion} />
                    ) : null}
                    <CustomWorkoutCard />
                  </>
                ) : null}
              </Fragment>
            ))}
          </div>
        )}
      </section>

      <MuscleProgressCard
        isOwner={isOwner}
        progress={analytics.muscleSetProgress}
        targets={weeklyMuscleTargets}
      />

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold">Recent sessions</h2>
            <AppLink className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700" href="/history">
              History
            </AppLink>
          </div>
          <div className="space-y-2">
            {recentSessions.length === 0 ? (
              <p className="text-sm text-slate-600">No sessions logged yet.</p>
            ) : (
              recentSessions.map((session) => (
                <SessionSummaryCard
                  isOwner={isOwner}
                  key={session.id}
                  session={session}
                />
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-bold">Watch list</h2>
          <div className="mt-3 space-y-2">
            {analytics.fatigueWatchList.length === 0 ? (
              <p className="text-sm text-slate-600">
                No high-RPE or pain flags in recent sessions.
              </p>
            ) : (
              analytics.fatigueWatchList.map((item) => (
                <div
                  className="rounded-xl bg-amber-50 p-3 text-sm font-medium text-amber-950"
                  key={`${item.type}-${item.sessionId}-${item.exerciseName}`}
                >
                  {item.exerciseName}: {item.reason}
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function TemplateCard({
  isOwner,
  template,
}: {
  isOwner: boolean;
  template: TemplateWithExercises;
}) {
  return (
    <article className="flex flex-col rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
      <div className="mb-3 flex-1">
        <h2 className="font-bold">{template.name}</h2>
        <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-600">
          {formatExerciseNames(template.workout_template_exercises)}
        </p>
      </div>
      {isOwner ? <StartTemplateButton templateId={template.id} /> : null}
    </article>
  );
}

function SuggestionCard({ suggestion }: { suggestion: SuggestionWithExercises }) {
  return (
    <article className="flex flex-col rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5">
      <div className="mb-3 flex-1">
        <h2 className="font-bold">{suggestion.name}</h2>
        <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-600">
          {formatExerciseNames(suggestion.workout_suggestion_exercises)}
        </p>
        {suggestion.estimated_duration_minutes !== null ? (
          <p className="mt-2 inline-flex rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
            {suggestion.target_session_type === "sunday" ? "Sunday" : "Weekday"} ·{" "}
            {suggestion.estimated_duration_minutes} min total
          </p>
        ) : null}
      </div>
      <StartSuggestionButton suggestionId={suggestion.id} />
    </article>
  );
}

function CustomWorkoutCard({ className = "" }: { className?: string }) {
  return (
    <article
      className={`${className} flex flex-col rounded-2xl border border-dashed border-emerald-300 bg-emerald-50/60 p-3.5`}
    >
      <p className="mb-3 flex-1 text-sm font-medium text-slate-700">
        Starting without a plan? Add exercises as you log.
      </p>
      <div className="grid gap-2">
        <StartEmptySessionButton />
        <AppLink
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-emerald-200 bg-white px-4 text-sm font-bold text-emerald-800 hover:bg-emerald-50"
          href="/sessions/prepare"
        >
          Prepare next session
        </AppLink>
      </div>
    </article>
  );
}

function formatExerciseNames(exercises?: ExerciseNameItem[]) {
  return exercises?.map((exercise) => exercise.exercise.name).join(", ");
}

function MetricCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm md:p-4">
      <span className="text-emerald-600">{icon}</span>
      <div className="mt-1 truncate text-sm font-extrabold tabular-nums tracking-tight md:mt-2 md:text-2xl">
        {value}
      </div>
      <div className="mt-0.5 truncate text-[10px] font-bold uppercase tracking-wide text-slate-400 md:text-xs">
        {label}
      </div>
    </div>
  );
}
