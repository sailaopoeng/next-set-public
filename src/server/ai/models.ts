export const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

export function getGeminiModel() {
  return process.env.GEMINI_MODEL?.trim() || "gemini-3.1-flash-lite";
}

export function getGeminiCoachModel() {
  return process.env.GEMINI_COACH_MODEL?.trim() || getGeminiModel();
}
