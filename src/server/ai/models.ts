export const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

/** Per-request Gemini timeout; callers fall back to deterministic output. */
export const GEMINI_TIMEOUT_MS = 20_000;

export function getGeminiModel() {
  return process.env.GEMINI_MODEL?.trim() || "gemini-3.1-flash-lite";
}

export function getGeminiCoachModel() {
  return process.env.GEMINI_COACH_MODEL?.trim() || getGeminiModel();
}
