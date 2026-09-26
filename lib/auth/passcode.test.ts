import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyPasscode } from "./passcode";

const ALEX = "correct horse battery staple";
const SAM = "purple monkey dishwasher";

beforeEach(() => {
  vi.stubEnv("APP_PASSCODES", `Alex:${ALEX},Sam:${SAM}`);
  vi.stubEnv("AUTH_SECRET", "s".repeat(32));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("verifyPasscode", () => {
  it("names whose code it is", async () => {
    expect(await verifyPasscode(ALEX)).toBe("Alex");
    expect(await verifyPasscode(SAM)).toBe("Sam");
  });

  it("ignores surrounding whitespace, as the env schema does", async () => {
    expect(await verifyPasscode(`  ${SAM}\n`)).toBe("Sam");
  });

  it.each([
    "",
    "wrong",
    "correct horse",
    `${ALEX}!`,
    ALEX.toUpperCase(),
    "correct  horse battery staple",
    "Alex",
    `Alex:${ALEX}`,
  ])("rejects %j", async (input) => {
    expect(await verifyPasscode(input)).toBeNull();
  });

  it("follows a change of code", async () => {
    vi.stubEnv("APP_PASSCODES", `Alex:a brand new code,Sam:${SAM}`);
    expect(await verifyPasscode(ALEX)).toBeNull();
    expect(await verifyPasscode("a brand new code")).toBe("Alex");
  });
});
