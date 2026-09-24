import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyPasscode } from "./passcode";

const PASSCODE = "correct horse battery staple";

beforeEach(() => {
  vi.stubEnv("APP_PASSCODE", PASSCODE);
  vi.stubEnv("AUTH_SECRET", "s".repeat(32));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("verifyPasscode", () => {
  it("accepts the passcode", async () => {
    expect(await verifyPasscode(PASSCODE)).toBe(true);
  });

  it("ignores surrounding whitespace, as the env schema does", async () => {
    expect(await verifyPasscode(`  ${PASSCODE}\n`)).toBe(true);
  });

  it.each([
    "",
    "wrong",
    "correct horse",
    `${PASSCODE}!`,
    PASSCODE.toUpperCase(),
    "correct  horse battery staple",
  ])("rejects %j", async (input) => {
    expect(await verifyPasscode(input)).toBe(false);
  });

  it("follows a change of passcode", async () => {
    vi.stubEnv("APP_PASSCODE", "a brand new passcode");
    expect(await verifyPasscode(PASSCODE)).toBe(false);
    expect(await verifyPasscode("a brand new passcode")).toBe(true);
  });
});
