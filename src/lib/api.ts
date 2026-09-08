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
