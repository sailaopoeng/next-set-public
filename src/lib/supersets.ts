export type SupersetBlock<T> = {
  id: string;
  groupId: string | null;
  items: T[];
};

export function buildSupersetBlocks<T extends { id: string }>(
  items: T[],
  getGroupId: (item: T) => string | null | undefined,
): SupersetBlock<T>[] {
  const blocks: SupersetBlock<T>[] = [];

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const groupId = getGroupId(item) ?? null;
    const next = items[index + 1];

    if (groupId && next && getGroupId(next) === groupId) {
      blocks.push({ id: `superset-${groupId}`, groupId, items: [item, next] });
      index += 1;
    } else {
      blocks.push({ id: item.id, groupId: null, items: [item] });
    }
  }

  return blocks;
}

export function shouldStartRestTimer(
  exercises: Array<{
    id: string;
    superset_group_id?: string | null;
    session_sets: Array<{ set_number: number; completed: boolean }>;
  }>,
  completedExerciseId: string,
  setNumber: number,
) {
  const completedExercise = exercises.find(
    (exercise) => exercise.id === completedExerciseId,
  );
  if (!completedExercise?.superset_group_id) return true;

  const group = exercises.filter(
    (exercise) =>
      exercise.superset_group_id === completedExercise.superset_group_id,
  );
  return (
    group.length === 2 &&
    group.every((exercise) =>
      exercise.session_sets.some(
        (set) => set.set_number === setNumber && set.completed,
      ),
    )
  );
}
