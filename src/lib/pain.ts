export const PAIN_PATTERN = /\b(pain|hurt|ache|strain|pinch(?!\s+collar\b)|sharp|injury|sore joint)\b/i;

export function textMentionsPain(value: string | null | undefined): boolean {
  return PAIN_PATTERN.test(value ?? "");
}

export function exerciseMentionsPain(exercise: {
  notes: string | null;
  session_sets: Array<{ note: string | null }>;
}): boolean {
  return textMentionsPain(exercise.notes) ||
    exercise.session_sets.some((set) => textMentionsPain(set.note));
}

export function sessionMentionsPain(session: {
  notes: string | null;
  session_exercises: Array<{
    notes: string | null;
    session_sets: Array<{ note: string | null }>;
  }>;
}): boolean {
  return textMentionsPain(session.notes) ||
    session.session_exercises.some(exerciseMentionsPain);
}
