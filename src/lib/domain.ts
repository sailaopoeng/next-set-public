export const DECISIONS = [
  "increase",
  "stay",
  "reduce",
  "adjust_reps",
  "watch_pain",
] as const;

export type ProgressionDecision = (typeof DECISIONS)[number];

export const MAIN_MUSCLE_GROUPS = [
  "chest",
  "back",
  "shoulders",
  "quads",
  "hamstrings",
  "glutes",
  "biceps",
  "triceps",
  "core",
] as const;

export type MainMuscleGroup = (typeof MAIN_MUSCLE_GROUPS)[number];

export type LiftCategory =
  | "barbell_upper"
  | "dumbbell_upper"
  | "lower_compound"
  | "machine"
  | "bodyweight"
  | "accessory"
  | "core"
  | "conditioning"
  | "other";

export type VolumeMultiplier = 1 | 2;

export type Exercise = {
  id: string;
  name: string;
  primary_muscle_group: string;
  secondary_muscle_groups: string[];
  equipment: string | null;
  lift_category: LiftCategory;
  default_increment_kg: number;
  is_main_lift: boolean;
  is_ai_suggestion_enabled: boolean;
  volume_multiplier: VolumeMultiplier;
  notes: string | null;
};

export type WorkoutTemplate = {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
};

export type TemplateExercise = {
  id: string;
  template_id: string;
  exercise_id: string;
  exercise_order: number;
  target_sets: number;
  target_reps_min: number;
  target_reps_max: number;
  target_weight_kg: number | null;
  target_set_weights_kg: Array<number | null>;
  rest_seconds: number;
  superset_group_id?: string | null;
  notes: string | null;
  exercise?: Exercise;
};

export type WorkoutSession = {
  id: string;
  template_id: string | null;
  source_suggestion_id: string | null;
  name: string;
  status: "active" | "completed" | "cancelled";
  performed_at: string;
  started_at: string;
  finished_at: string | null;
  notes: string | null;
};

export type SessionExercise = {
  id: string;
  session_id: string;
  exercise_id: string;
  exercise_order: number;
  planned_sets: number;
  target_reps_min: number;
  target_reps_max: number;
  target_weight_kg: number | null;
  rest_seconds: number;
  superset_group_id?: string | null;
  notes: string | null;
  exercise?: Exercise;
};

export type SessionSet = {
  id: string;
  session_exercise_id: string;
  set_number: number;
  weight_kg: number;
  reps: number;
  rpe: number | null;
  completed: boolean;
  note: string | null;
};

export type SessionWithDetails = WorkoutSession & {
  session_exercises: Array<
    SessionExercise & {
      exercise: Exercise;
      session_sets: SessionSet[];
    }
  >;
};

export type AiExerciseDecision = {
  id?: string;
  session_exercise_id: string;
  exercise_name: string;
  decision: ProgressionDecision;
  reason: string;
  suggested_sets: number;
  suggested_reps_min: number;
  suggested_reps_max: number;
  suggested_weight_kg: number | null;
  suggested_rest_seconds: number;
  notes: string | null;
};

export type WorkoutSuggestion = {
  id: string;
  source_session_id: string;
  source_template_id: string | null;
  name: string;
  rationale: string | null;
  weekly_balance_notes: string[];
  estimated_duration_minutes: number | null;
  target_session_type: "weekday" | "sunday" | null;
  status: "draft" | "accepted" | "used";
};

export type AnalyticsSummary = {
  weeklyWorkoutCount: number;
  totalSets: number;
  totalVolume: number;
  workoutsCompletedThisWeek: number;
  weeksMeetingTarget: number;
};

export type WeeklyAnalysisAction = {
  id: string;
  text: string;
};

export type WeeklyAnalysis = {
  schemaVersion: 1;
  weekStart: string;
  weekEnd: string;
  comparisonWeekStart: string;
  comparisonWeekEnd: string;
  isCurrentWeek: boolean;
  workoutsCompleted: number;
  workoutTarget: number;
  targetSnapshot: Record<string, { minimum: number; maximum: number }>;
  summary: string;
  observations: string[];
  nextWeekActions: WeeklyAnalysisAction[];
  deload: {
    recommended: boolean;
    confirmedForSelectedWeek: boolean;
    confirmedForNextWeek: boolean;
    reasons: string[];
  };
};

export type SavedWeeklyAnalysis = {
  id: string;
  week_start: string;
  provider: string;
  model: string;
  analysis_json: WeeklyAnalysis;
  updated_at: string;
};

export type DeloadWeek = {
  week_start: string;
  source: "manual" | "ai_recommendation";
};
