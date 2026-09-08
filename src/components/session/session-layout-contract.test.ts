import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  LIVE_EXERCISE_STICKY_HEADER_CLASS_NAME,
  LIVE_SESSION_ROOT_CLASS_NAME,
  LIVE_SESSION_STICKY_FOOTER_CLASS_NAME,
  LIVE_SESSION_STICKY_HEADER_CLASS_NAME,
} from "@/components/session/session-layout-contract";

describe("live session sticky layout contract", () => {
  const loggerSource = readFileSync(
    new URL("./session-logger.tsx", import.meta.url),
    "utf8",
  );

  it("keeps the session summary header sticky", () => {
    expect(LIVE_SESSION_STICKY_HEADER_CLASS_NAME.split(" ")).toEqual(
      expect.arrayContaining(["sticky", "top-16", "z-30"]),
    );
  });

  it("keeps exercise headers sticky", () => {
    expect(LIVE_EXERCISE_STICKY_HEADER_CLASS_NAME.split(" ")).toEqual(
      expect.arrayContaining(["sticky", "top-[8rem]", "z-10"]),
    );
  });

  it("keeps the session action footer sticky above the safe area", () => {
    expect(LIVE_SESSION_STICKY_FOOTER_CLASS_NAME.split(" ")).toEqual(
      expect.arrayContaining([
        "sticky",
        "bottom-[calc(env(safe-area-inset-bottom)+0.5rem)]",
        "z-40",
      ]),
    );
  });

  it("does not turn the logger root into a sticky-breaking scroll container", () => {
    expect(LIVE_SESSION_ROOT_CLASS_NAME).not.toMatch(
      /(?:^|\s)overflow(?:-x|-y)?-(?:auto|clip|hidden|scroll)(?:\s|$)/,
    );
  });

  it("keeps every protected layout contract connected to the logger", () => {
    expect(loggerSource).toContain("className={LIVE_SESSION_ROOT_CLASS_NAME}");
    expect(loggerSource).toContain(
      "className={LIVE_SESSION_STICKY_HEADER_CLASS_NAME}",
    );
    expect(loggerSource).toContain(
      "className={LIVE_EXERCISE_STICKY_HEADER_CLASS_NAME}",
    );
    expect(loggerSource).toContain(
      "className={LIVE_SESSION_STICKY_FOOTER_CLASS_NAME}",
    );
  });
});
