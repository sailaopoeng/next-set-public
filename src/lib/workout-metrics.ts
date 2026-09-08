import type {
  SessionSet,
  SessionWithDetails,
  VolumeMultiplier,
} from "@/lib/domain";

export function sessionSetVolume(
  set: Pick<SessionSet, "weight_kg" | "reps">,
  volumeMultiplier: VolumeMultiplier,
) {
  return roundToHalf(set.weight_kg * set.reps * volumeMultiplier);
}

export function sessionVolume(session: SessionWithDetails) {
  return session.session_exercises.reduce(
    (sessionTotal, exercise) =>
      sessionTotal +
      exercise.session_sets
        .filter((set) => set.completed)
        .reduce(
          (exerciseTotal, set) =>
            exerciseTotal +
            sessionSetVolume(set, exercise.exercise.volume_multiplier),
          0,
        ),
    0,
  );
}

function roundToHalf(value: number) {
  return Math.round(value * 2) / 2;
}
