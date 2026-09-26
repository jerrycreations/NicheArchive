import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { unlockClientKey } from "@/lib/auth/client-key";
import { verifyPasscode } from "@/lib/auth/passcode";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { clearUnlockAttempts, reserveUnlockAttempt } from "@/lib/db/queries/unlock-attempts";
import { DATABASE_UNREACHABLE } from "@/lib/errors";
import { signOut, unlock } from "./auth";

const setCookie = vi.fn();
const deleteCookie = vi.fn();
const redirect = vi.fn((url: string) => {
  // Like Next's redirect(), it never returns.
  throw new Error(`redirect:${url}`);
});

vi.mock("next/headers", () => ({
  cookies: async () => ({ set: setCookie, delete: deleteCookie }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirect(url),
}));
// Mocked so the fake timers below only see the failure delay; the real check
// is covered in lib/auth/passcode.test.ts.
vi.mock("@/lib/auth/passcode", () => ({ verifyPasscode: vi.fn() }));
vi.mock("@/lib/auth/client-key", () => ({ unlockClientKey: vi.fn() }));
vi.mock("@/lib/db/queries/unlock-attempts", () => ({
  reserveUnlockAttempt: vi.fn(),
  clearUnlockAttempts: vi.fn(),
}));

const initial = { error: null };
const CLIENT_KEY = "client-key";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(unlockClientKey).mockResolvedValue(CLIENT_KEY);
  vi.mocked(reserveUnlockAttempt).mockResolvedValue({ allowed: true, triesLeft: 4 });
  vi.mocked(clearUnlockAttempts).mockResolvedValue();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("APP_PASSCODES", "Alex:correct horse battery staple,Sam:purple monkey dishwasher");
  vi.stubEnv("AUTH_SECRET", "s".repeat(32));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("unlock", () => {
  it("counts the try, waits 500 ms and says how many are left", async () => {
    vi.useFakeTimers();
    vi.mocked(verifyPasscode).mockResolvedValue(null);

    let settled = false;
    const result = unlock(initial, form({ passcode: "wrong", next: "/library" }));
    void result.then(() => (settled = true));

    await vi.advanceTimersByTimeAsync(499);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toEqual({ error: "That code isn't right. 4 tries left." });
    expect(reserveUnlockAttempt).toHaveBeenCalledExactlyOnceWith(CLIENT_KEY);
    expect(clearUnlockAttempts).not.toHaveBeenCalled();
    expect(setCookie).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it.each([
    [1, "That code isn't right. 1 try left."],
    [0, "That code isn't right, and that was the last try. Try again in an hour."],
  ])("with %i tries left, says %j", async (triesLeft, message) => {
    vi.useFakeTimers();
    vi.mocked(reserveUnlockAttempt).mockResolvedValue({ allowed: true, triesLeft });
    vi.mocked(verifyPasscode).mockResolvedValue(null);
    const result = unlock(initial, form({ passcode: "wrong" }));
    await vi.advanceTimersByTimeAsync(500);
    expect(await result).toEqual({ error: message });
  });

  it("refuses a locked-out address without checking the code", async () => {
    const retryAt = new Date(Date.now() + 42 * 60_000 - 1000);
    vi.mocked(reserveUnlockAttempt).mockResolvedValue({ allowed: false, retryAt });

    expect(await unlock(initial, form({ passcode: "correct horse battery staple" }))).toEqual({
      error: "Too many wrong codes. Try again in 42 minutes.",
    });
    expect(verifyPasscode).not.toHaveBeenCalled();
    expect(setCookie).not.toHaveBeenCalled();
  });

  it("says at least a minute when the lock is about to end", async () => {
    vi.mocked(reserveUnlockAttempt).mockResolvedValue({
      allowed: false,
      retryAt: new Date(Date.now() + 5_000),
    });
    expect(await unlock(initial, form({ passcode: "anything" }))).toEqual({
      error: "Too many wrong codes. Try again in 1 minute.",
    });
  });

  it.each<Record<string, string>>([{}, { passcode: "   " }])(
    "asks for a code without counting a try, given %j",
    async (fields) => {
      expect(await unlock(initial, form(fields))).toEqual({ error: "Enter your code." });
      expect(reserveUnlockAttempt).not.toHaveBeenCalled();
      expect(verifyPasscode).not.toHaveBeenCalled();
    },
  );

  it("lets nobody in when the tries can't be counted", async () => {
    vi.mocked(reserveUnlockAttempt).mockRejectedValue(
      Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }),
    );
    expect(await unlock(initial, form({ passcode: "correct horse battery staple" }))).toEqual({
      error: DATABASE_UNREACHABLE,
    });

    vi.mocked(reserveUnlockAttempt).mockRejectedValue(new Error("syntax error"));
    expect(await unlock(initial, form({ passcode: "correct horse battery staple" }))).toEqual({
      error: "Couldn't check your code. Try again.",
    });
    expect(verifyPasscode).not.toHaveBeenCalled();
    expect(setCookie).not.toHaveBeenCalled();
  });

  it("signs the person in, forgets the tries and goes to the requested page", async () => {
    vi.mocked(verifyPasscode).mockResolvedValue("Sam");

    await expect(
      unlock(initial, form({ passcode: "right", next: "/videos/dQw4w9WgXcQ?t=95" })),
    ).rejects.toThrow("redirect:/videos/dQw4w9WgXcQ?t=95");

    expect(clearUnlockAttempts).toHaveBeenCalledExactlyOnceWith(CLIENT_KEY);
    expect(setCookie).toHaveBeenCalledTimes(1);
    const [name, token, options] = setCookie.mock.calls[0];
    expect(name).toBe(SESSION_COOKIE);
    expect(await verifySessionToken(token)).toEqual({ person: "Sam" });
    expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
  });

  it("still signs in when forgetting the tries fails", async () => {
    vi.mocked(verifyPasscode).mockResolvedValue("Alex");
    vi.mocked(clearUnlockAttempts).mockRejectedValue(new Error("database hiccup"));
    await expect(unlock(initial, form({ passcode: "right" }))).rejects.toThrow("redirect:/library");
    expect(setCookie).toHaveBeenCalledTimes(1);
  });

  it.each(["//evil.example", "https://evil.example", "/unlock", ""])(
    "goes to /library instead of next=%j",
    async (next) => {
      vi.mocked(verifyPasscode).mockResolvedValue("Alex");
      await expect(unlock(initial, form({ passcode: "right", next }))).rejects.toThrow(
        "redirect:/library",
      );
    },
  );
});

describe("signOut", () => {
  it("deletes the session cookie and goes to the unlock page", async () => {
    await expect(signOut()).rejects.toThrow("redirect:/unlock");
    expect(deleteCookie).toHaveBeenCalledExactlyOnceWith(SESSION_COOKIE);
  });
});
