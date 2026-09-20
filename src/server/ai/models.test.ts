import { afterEach, describe, expect, it, vi } from "vitest";

import { getGeminiCoachModel, getGeminiModel } from "@/server/ai/models";

afterEach(() => vi.unstubAllEnvs());

describe("Gemini model selection", () => {
  it("uses the same default model across AI features", () => {
    vi.stubEnv("GEMINI_MODEL", "");
    vi.stubEnv("GEMINI_COACH_MODEL", "");
    expect(getGeminiModel()).toBe("gemini-3.1-flash-lite");
    expect(getGeminiCoachModel()).toBe(getGeminiModel());
  });

  it("allows a coach override while trimming env values", () => {
    vi.stubEnv("GEMINI_MODEL", " model-a ");
    vi.stubEnv("GEMINI_COACH_MODEL", " model-b ");
    expect(getGeminiModel()).toBe("model-a");
    expect(getGeminiCoachModel()).toBe("model-b");
  });
});
