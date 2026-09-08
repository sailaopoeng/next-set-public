export type PlateCalculation = {
  perSideKg: number;
  plates: PlateCount[];
  remainingKg: number;
  isBalanced: boolean;
};

export type PlateCount = {
  weightKg: number;
  count: number;
};

export const DEFAULT_BAR_WEIGHT_KG = 20;

export const DEFAULT_PLATE_WEIGHTS_KG = [20, 15, 10, 5, 2.5, 1.25, 25] as const;
export const DISPLAY_PLATE_WEIGHTS_KG = [25, 20, 15, 10, 5, 2.5, 1.25] as const;

export function calculateBarbellPlates({
  targetKg,
  barKg = DEFAULT_BAR_WEIGHT_KG,
  platesKg = DEFAULT_PLATE_WEIGHTS_KG,
}: {
  targetKg: number;
  barKg?: number;
  platesKg?: readonly number[];
}): PlateCalculation {
  if (!Number.isFinite(targetKg) || !Number.isFinite(barKg)) {
    return emptyCalculation(false);
  }

  const remainingKg = targetKg - barKg;
  if (remainingKg < 0) {
    return emptyCalculation(false);
  }

  const perSideKg = roundPlateWeight(remainingKg / 2);
  const sortedPlatesKg = platesKg.filter(
    (plate) => Number.isFinite(plate) && plate > 0,
  );
  const plateCounts: PlateCount[] = [];
  let remainingPerSideKg = perSideKg;

  for (const plateKg of sortedPlatesKg) {
    const count = Math.floor(roundPlateWeight(remainingPerSideKg) / plateKg);
    if (count <= 0) continue;

    plateCounts.push({ weightKg: plateKg, count });
    remainingPerSideKg = roundPlateWeight(remainingPerSideKg - count * plateKg);
  }

  return {
    perSideKg,
    plates: plateCounts,
    remainingKg: roundPlateWeight(remainingPerSideKg),
    isBalanced: remainingKg >= 0 && roundPlateWeight(remainingPerSideKg) === 0,
  };
}

function emptyCalculation(isBalanced: boolean): PlateCalculation {
  return {
    perSideKg: 0,
    plates: [],
    remainingKg: 0,
    isBalanced,
  };
}

function roundPlateWeight(value: number) {
  return Math.round(value * 100) / 100;
}
