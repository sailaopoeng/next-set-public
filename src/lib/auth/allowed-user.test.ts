import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function configureOwner(email: string | undefined) {
  vi.stubEnv("ALLOWED_EMAIL", email);
  vi.resetModules();
  return import("./allowed-user");
}

describe("single-owner email authorization", () => {
  it.each([undefined, "", "   "])(
    "denies every account when owner configuration is %s",
    async (configuredEmail) => {
      const { isAllowedEmail, getAllowedEmail } = await configureOwner(configuredEmail);
      expect(getAllowedEmail()).toBe("");
      for (const candidate of [undefined, null, "", "   ", "owner@example.com"]) {
        expect(isAllowedEmail(candidate)).toBe(false);
      }
    },
  );

  it("accepts only the configured account after case and whitespace normalization", async () => {
    const { isAllowedEmail, getAllowedEmail } = await configureOwner(" Owner@Example.com ");
    expect(getAllowedEmail()).toBe("owner@example.com");
    expect(isAllowedEmail(" OWNER@example.COM ")).toBe(true);
    for (const candidate of [undefined, null, "", "other@example.com", "owner+other@example.com", "owner@example.com.attacker.test"]) {
      expect(isAllowedEmail(candidate)).toBe(false);
    }
  });

  it("allows a configured Google Workspace account without requiring Gmail", async () => {
    const { isAllowedEmail } = await configureOwner("owner@workspace.example");
    expect(isAllowedEmail("owner@workspace.example")).toBe(true);
    expect(isAllowedEmail("other@workspace.example")).toBe(false);
  });
});
