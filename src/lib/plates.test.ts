import { describe, expect, it } from "vitest";

import { calculateBarbellPlates } from "@/lib/plates";

describe("calculateBarbellPlates", () => {
  it.each([
    {
      targetKg: 60,
      plates: [{ weightKg: 20, count: 1 }],
      perSideKg: 20,
    },
    {
      targetKg: 70,
      plates: [
        { weightKg: 20, count: 1 },
        { weightKg: 5, count: 1 },
      ],
      perSideKg: 25,
    },
    {
      targetKg: 100,
      plates: [{ weightKg: 20, count: 2 }],
      perSideKg: 40,
    },
    {
      targetKg: 110,
      plates: [
        { weightKg: 20, count: 2 },
        { weightKg: 5, count: 1 },
      ],
      perSideKg: 45,
    },
  ])("calculates plates per side for $targetKg kg", (example) => {
    expect(calculateBarbellPlates({ targetKg: example.targetKg })).toMatchObject(
      {
        isBalanced: true,
        perSideKg: example.perSideKg,
        plates: example.plates,
        remainingKg: 0,
      },
    );
  });

  it("reports when the target cannot be loaded with the available plates", () => {
    expect(calculateBarbellPlates({ targetKg: 63 })).toMatchObject({
      isBalanced: false,
      perSideKg: 21.5,
      remainingKg: 0.25,
    });
  });

  it("excludes unavailable plates from the recommendation", () => {
    expect(
      calculateBarbellPlates({
        targetKg: 90,
        platesKg: [20, 10, 5, 2.5, 1.25, 25],
      }),
    ).toMatchObject({
      isBalanced: true,
      perSideKg: 35,
      plates: [
        { weightKg: 20, count: 1 },
        { weightKg: 10, count: 1 },
        { weightKg: 5, count: 1 },
      ],
      remainingKg: 0,
    });
  });
});
