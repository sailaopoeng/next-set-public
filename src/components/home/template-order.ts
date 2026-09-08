import {
  getSingaporeWeekday,
  SCHEDULED_WORKOUT_BY_DAY,
} from "@/lib/workout-schedule";

const WORKOUT_QUEUE = ["Workout A", "Workout B", "Workout C"] as const;

export function getScheduledTemplateIndex<T extends { name: string }>(
  templates: readonly T[],
  date = new Date(),
) {
  const scheduledWorkout =
    SCHEDULED_WORKOUT_BY_DAY[getSingaporeWeekday(date)];

  if (!scheduledWorkout) return -1;

  return templates.findIndex(
    (template) =>
      normalizeWorkoutName(template.name) === normalizeWorkoutName(scheduledWorkout),
  );
}

export function orderHomeWorkoutTemplates<T extends { id: string; name: string }>(
  templates: readonly T[],
  date = new Date(),
  lastCompletedTemplateId?: string | null,
) {
  if (templates.length === 0) return [];

  const scheduledIndex = getScheduledTemplateIndex(templates, date);
  let recommendedIndex = scheduledIndex >= 0 ? scheduledIndex : 0;
  if (
    templates.length > 1 &&
    lastCompletedTemplateId &&
    templates[recommendedIndex].id === lastCompletedTemplateId
  ) {
    recommendedIndex = getNextQueueTemplateIndex(templates, recommendedIndex);
  }

  return moveTemplateFirst(templates, recommendedIndex);
}

function getNextQueueTemplateIndex<T extends { name: string }>(
  templates: readonly T[],
  currentIndex: number,
) {
  const currentQueueIndex = WORKOUT_QUEUE.findIndex(
    (name) =>
      normalizeWorkoutName(name) ===
      normalizeWorkoutName(templates[currentIndex].name),
  );

  if (currentQueueIndex >= 0) {
    for (let offset = 1; offset < WORKOUT_QUEUE.length; offset += 1) {
      const nextName =
        WORKOUT_QUEUE[(currentQueueIndex + offset) % WORKOUT_QUEUE.length];
      const nextIndex = templates.findIndex(
        (template) =>
          normalizeWorkoutName(template.name) === normalizeWorkoutName(nextName),
      );

      if (nextIndex >= 0) return nextIndex;
    }
  }

  return (currentIndex + 1) % templates.length;
}

function moveTemplateFirst<T>(templates: readonly T[], index: number) {
  if (index <= 0) return [...templates];

  return [
    templates[index],
    ...templates.slice(0, index),
    ...templates.slice(index + 1),
  ];
}

function normalizeWorkoutName(name: string) {
  return name.replace(/[\s_-]+/g, "").toLowerCase();
}
