import { describe, expect, it } from "vitest";

import {
  filterHistoryRows,
  historyHref,
  parseHistoryFilters,
  type HistoryIndexRow,
} from "@/lib/history-filters";

const rows: HistoryIndexRow[] = [
  {
    id: "bench-session",
    name: "Workout A",
    template_id: "template-a",
    performed_at: "2026-09-19T17:00:00Z", // 20 Sep in Singapore
    session_exercises: [{ exercise: { name: "Bench Press" } }],
  },
  {
    id: "squat-session",
    name: "Leg day",
    template_id: "template-b",
    performed_at: "2026-09-18T03:00:00Z",
    session_exercises: [{ exercise: { name: "Back Squat" } }],
  },
];

describe("history filters", () => {
  it("matches exercise and session names without case sensitivity", () => {
    expect(filterHistoryRows(rows, parseHistoryFilters({ q: "BENCH" })).map((row) => row.id))
      .toEqual(["bench-session"]);
    expect(filterHistoryRows(rows, parseHistoryFilters({ q: "leg" })).map((row) => row.id))
      .toEqual(["squat-session"]);
  });

  it("combines template and Singapore-local date filters", () => {
    expect(filterHistoryRows(rows, parseHistoryFilters({
      template: "template-a", from: "2026-09-20", to: "2026-09-20",
    })).map((row) => row.id)).toEqual(["bench-session"]);
    expect(filterHistoryRows(rows, parseHistoryFilters({ to: "2026-09-19" })).map((row) => row.id))
      .toEqual(["squat-session"]);
  });

  it("normalizes bad dates and preserves filters in page links", () => {
    const filters = parseHistoryFilters({ q: " bench ", from: "2026-02-30", page: "2" });
    expect(filters).toMatchObject({ search: "bench", from: "", page: 2 });
    expect(historyHref(filters, 3)).toBe("/history?q=bench&page=3");
  });
});
