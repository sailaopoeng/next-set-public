export type ApiErrorBody = {
  error: string;
  message: string;
};

export function jsonError(
  status: number,
  error: string,
  message: string,
): Response {
  return Response.json({ error, message } satisfies ApiErrorBody, { status });
}

/**
 * Reads a JSON request body. A missing or malformed body yields `undefined`
 * so route-level schema validation answers with a 400 instead of a 500.
 */
export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Route ids are Postgres uuids; anything else can never match a row. */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function notFoundResponse(): Response {
  return jsonError(404, "NOT_FOUND", "The requested record was not found.");
}

/** For an exact `ilike` match: `_` and `%` must not act as wildcards. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}
