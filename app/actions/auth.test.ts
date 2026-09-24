import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyPasscode } from "@/lib/auth/passcode";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { unlock } from "./auth";

const setCookie = vi.fn();
const redirect = vi.fn((url: string) => {
  // Like Next's redirect(), it never returns.
  throw new Error(`redirect:${url}`);
});

vi.mock("next/headers", () => ({
  cookies: async () => ({ set: setCookie }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirect(url),
}));
// Mocked so the fake timers below only see the failure delay; the real check
// is covered in lib/auth/passcode.test.ts.
vi.mock("@/lib/auth/passcode", () => ({ verifyPasscode: vi.fn() }));

const initial = { error: null };

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeEach(() => {
  setCookie.mockClear();
  redirect.mockClear();
  vi.mocked(verifyPasscode).mockReset();
  vi.stubEnv("APP_PASSCODE", "correct horse battery staple");
  vi.stubEnv("AUTH_SECRET", "s".repeat(32));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("unlock", () => {
  it("waits 500 ms before saying a wrong passcode isn't right", async () => {
    vi.useFakeTimers();
    vi.mocked(verifyPasscode).mockResolvedValue(false);

    let settled = false;
    const result = unlock(initial, form({ passcode: "wrong", next: "/library" }));
    void result.then(() => (settled = true));

    await vi.advanceTimersByTimeAsync(499);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toEqual({ error: "That passcode isn't right." });
    expect(setCookie).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("refuses a submission with no passcode field", async () => {
    vi.useFakeTimers();
    const result = unlock(initial, form({ next: "/library" }));
    await vi.advanceTimersByTimeAsync(500);
    expect(await result).toEqual({ error: "That passcode isn't right." });
    expect(verifyPasscode).not.toHaveBeenCalled();
  });

  it("sets a valid session cookie and goes to the requested page", async () => {
    vi.mocked(verifyPasscode).mockResolvedValue(true);

    await expect(
      unlock(initial, form({ passcode: "right", next: "/videos/dQw4w9WgXcQ?t=95" })),
    ).rejects.toThrow("redirect:/videos/dQw4w9WgXcQ?t=95");

    expect(setCookie).toHaveBeenCalledTimes(1);
    const [name, token, options] = setCookie.mock.calls[0];
    expect(name).toBe(SESSION_COOKIE);
    expect(await verifySessionToken(token)).toBe(true);
    expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
  });

  it.each(["//evil.example", "https://evil.example", "/unlock", ""])(
    "goes to /library instead of next=%j",
    async (next) => {
      vi.mocked(verifyPasscode).mockResolvedValue(true);
      await expect(unlock(initial, form({ passcode: "right", next }))).rejects.toThrow(
        "redirect:/library",
      );
    },
  );
});
