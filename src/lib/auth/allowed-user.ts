// Keep owner configuration in the auth module, outside shared domain exports.
export const ALLOWED_EMAIL = process.env.ALLOWED_EMAIL?.trim().toLowerCase() ?? "";

export function isAllowedEmail(email: string | null | undefined): boolean {
  return Boolean(ALLOWED_EMAIL) && email?.trim().toLowerCase() === ALLOWED_EMAIL;
}

export function getAllowedEmail(): string {
  return ALLOWED_EMAIL;
}
