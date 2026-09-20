import { describe, expect, it } from "vitest";

import {
  parseRestTimerState,
  remainingRestSeconds,
  REST_TIMER_STORAGE_VERSION,
  serializeRestTimerState,
} from "@/components/session/rest-timer";

const now = Date.parse("2026-09-20T10:00:00.000Z");

describe("rest timer persistence", () => {
  it("round-trips an in-progress timer", () => {
    const timer = {
      exerciseName: "Bench press",
      seconds: 90,
      endAt: now + 45_000,
      visible: true,
    };

    expect(parseRestTimerState(serializeRestTimerState(timer), now)).toEqual(
      timer,
    );
    expect(remainingRestSeconds(timer, now)).toBe(45);
  });

  it("drops expired or corrupt timers", () => {
    expect(
      parseRestTimerState(
        serializeRestTimerState({
          exerciseName: "Row",
          seconds: 90,
          endAt: now - 1000,
          visible: true,
        }),
        now,
      ),
    ).toBeNull();
    expect(parseRestTimerState("not-json", now)).toBeNull();
    expect(
      parseRestTimerState(
        JSON.stringify({
          version: REST_TIMER_STORAGE_VERSION + 1,
          exerciseName: "Row",
          seconds: 90,
          endAt: now + 10_000,
          visible: true,
        }),
        now,
      ),
    ).toBeNull();
  });
});
