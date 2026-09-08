import { describe, expect, it } from "vitest";

import {
  getScheduledTemplateIndex,
  orderHomeWorkoutTemplates,
} from "@/components/home/template-order";

const templates = [
  { id: "a", name: "Workout A" },
  { id: "b", name: "Workout B" },
  { id: "c", name: "Workout C" },
];

describe("orderHomeWorkoutTemplates", () => {
  it.each([
    ["2026-05-24T04:00:00.000Z", "Workout A"],
    ["2026-05-25T04:00:00.000Z", "Workout A"],
    ["2026-05-26T04:00:00.000Z", "Workout B"],
    ["2026-05-27T04:00:00.000Z", "Workout B"],
    ["2026-05-28T04:00:00.000Z", "Workout C"],
    ["2026-05-29T04:00:00.000Z", "Workout C"],
  ])("puts %s's scheduled workout first", (instant, expectedName) => {
    const ordered = orderHomeWorkoutTemplates(templates, new Date(instant));

    expect(ordered[0].name).toBe(expectedName);
  });

  it("uses Singapore time when choosing the scheduled workout", () => {
    const sundayInSingapore = new Date("2026-05-23T16:00:00.000Z");

    expect(getScheduledTemplateIndex(templates, sundayInSingapore)).toBe(0);
  });

  it("retains saved ordering on Saturday", () => {
    const savedOrder = [templates[2], templates[1], templates[0]];
    const saturday = new Date("2026-05-30T04:00:00.000Z");

    expect(orderHomeWorkoutTemplates(savedOrder, saturday)).toEqual(savedOrder);
  });

  it("matches edited separator styles for the starter workout names", () => {
    const hyphenatedTemplates = [
      { id: "a", name: "Workout A" },
      { id: "b", name: "Workout-B" },
      { id: "c", name: "Workout C" },
    ];
    const tuesday = new Date("2026-05-26T04:00:00.000Z");

    expect(orderHomeWorkoutTemplates(hyphenatedTemplates, tuesday)[0].name).toBe(
      "Workout-B",
    );
  });

  it("promotes Workout C when Tuesday's Workout B was last completed", () => {
    const tuesday = new Date("2026-05-26T04:00:00.000Z");

    expect(orderHomeWorkoutTemplates(templates, tuesday, "b").map(({ name }) => name))
      .toEqual(["Workout C", "Workout A", "Workout B"]);
  });

  it("wraps the workout queue from Workout C to Workout A", () => {
    const thursday = new Date("2026-05-28T04:00:00.000Z");

    expect(orderHomeWorkoutTemplates(templates, thursday, "c")[0].name).toBe(
      "Workout A",
    );
  });
});
