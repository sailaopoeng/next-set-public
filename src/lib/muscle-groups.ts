const MUSCLE_ALIASES: Record<string, string> = {
  abdominal: "core",
  abdominals: "core",
  abs: "core",
  bicep: "biceps",
  biceps: "biceps",
  chest: "chest",
  delt: "shoulders",
  deltoid: "shoulders",
  deltoids: "shoulders",
  delts: "shoulders",
  glute: "glutes",
  glutes: "glutes",
  hamstring: "hamstrings",
  hamstrings: "hamstrings",
  quad: "quads",
  quadriceps: "quads",
  quads: "quads",
  shoulder: "shoulders",
  shoulders: "shoulders",
  tricep: "triceps",
  triceps: "triceps",
};

export function canonicalMuscleGroup(value: string) {
  const normalized = value.trim().toLowerCase();
  return MUSCLE_ALIASES[normalized] ?? normalized;
}
