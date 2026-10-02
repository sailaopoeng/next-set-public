import { describe, expect, it } from "vitest";

import { escapeLikePattern, isJsonObject, isUuid, readJsonBody } from "@/lib/api";

describe("api helpers", () => {
  it("returns undefined for a malformed JSON body", async () => {
    const request = new Request("https://example.test", {
      method: "POST",
      body: "{not json",
    });

    await expect(readJsonBody(request)).resolves.toBeUndefined();
  });

  it("parses a valid JSON body", async () => {
    const request = new Request("https://example.test", {
      method: "POST",
      body: JSON.stringify({ id: "a" }),
    });

    await expect(readJsonBody(request)).resolves.toEqual({ id: "a" });
  });

  it("recognises plain JSON objects only", () => {
    expect(isJsonObject({})).toBe(true);
    expect(isJsonObject(null)).toBe(false);
    expect(isJsonObject([])).toBe(false);
    expect(isJsonObject(undefined)).toBe(false);
  });

  it("accepts uuids and rejects other route ids", () => {
    expect(isUuid("22222222-2222-4222-8222-222222222222")).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid("draft-22222222-2222-4222-8222-222222222222")).toBe(false);
  });

  it("escapes LIKE wildcards", () => {
    expect(escapeLikePattern("first_last%x@example.com")).toBe(
      "first\\_last\\%x@example.com",
    );
    expect(escapeLikePattern("a\\b")).toBe("a\\\\b");
  });
});
