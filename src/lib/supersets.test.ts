import { describe, expect, it } from "vitest";

import {
  buildSupersetBlocks,
  shouldStartRestTimer,
} from "@/lib/supersets";

describe("supersets", () => {
  it("groups only adjacent matching exercise pairs", () => {
    const items = [
      { id: "a", group: "group-1" },
      { id: "b", group: "group-1" },
      { id: "c", group: null },
    ];

    expect(buildSupersetBlocks(items, (item) => item.group)).toEqual([
      { id: "superset-group-1", groupId: "group-1", items: items.slice(0, 2) },
      { id: "c", groupId: null, items: [items[2]] },
    ]);
  });

  it("starts rest only when both exercise sets in a round are complete", () => {
    const exercises = [
      {
        id: "a",
        superset_group_id: "group-1",
        session_sets: [{ set_number: 1, completed: true }],
      },
      {
        id: "b",
        superset_group_id: "group-1",
        session_sets: [{ set_number: 1, completed: false }],
      },
    ];

    expect(shouldStartRestTimer(exercises, "a", 1)).toBe(false);
    exercises[1].session_sets[0].completed = true;
    expect(shouldStartRestTimer(exercises, "b", 1)).toBe(true);
  });

  it("keeps standalone rest behavior", () => {
    expect(
      shouldStartRestTimer(
        [{ id: "a", superset_group_id: null, session_sets: [] }],
        "a",
        1,
      ),
    ).toBe(true);
  });
});
