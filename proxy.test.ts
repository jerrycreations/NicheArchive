import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth/session";
import { SIGNED_OUT } from "@/lib/errors";
import { config, proxy } from "./proxy";

beforeEach(() => {
  vi.stubEnv("APP_PASSCODES", "Alex:correct horse battery staple,Sam:purple monkey dishwasher");
  vi.stubEnv("AUTH_SECRET", "s".repeat(32));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function request(path: string, token?: string) {
  const headers = token ? { cookie: `${SESSION_COOKIE}=${token}` } : undefined;
  return new NextRequest(new URL(path, "http://localhost:3000"), { headers });
}

// NextResponse.next() marks the response with this header.
function passedThrough(response: Response) {
  return response.headers.get("x-middleware-next") === "1";
}

describe("proxy matcher", () => {
  it.each([
    "/",
    "/library",
    "/videos/dQw4w9WgXcQ?t=95",
    "/unlock",
    "/api/chat",
    "/api/cron/ping",
    "/dev/captions",
  ])("runs on %s", (url) => {
    expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true);
  });

  it.each([
    "/_next/static/chunks/main.js",
    "/_next/image?url=https%3A%2F%2Fi.ytimg.com%2Fvi%2Fabc%2Fhqdefault.jpg&w=640&q=75",
    "/favicon.ico",
    "/robots.txt",
    "/logo.svg",
  ])("skips %s", (url) => {
    expect(unstable_doesMiddlewareMatch({ config, url })).toBe(false);
  });
});

describe("proxy", () => {
  it("sends a signed-out page request to the unlock page, remembering where it was going", async () => {
    const response = await proxy(request("/videos/dQw4w9WgXcQ?t=95"));
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/unlock?next=%2Fvideos%2FdQw4w9WgXcQ%3Ft%3D95",
    );
  });

  it("answers a signed-out API request with 401 JSON", async () => {
    const response = await proxy(request("/api/videos/status?ids=abc"));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: SIGNED_OUT });
  });

  it("lets the unlock page and the cron routes through without a session", async () => {
    expect(passedThrough(await proxy(request("/unlock?next=%2Flibrary")))).toBe(true);
    expect(passedThrough(await proxy(request("/api/cron/ping")))).toBe(true);
  });

  it("lets a signed-in device through", async () => {
    const token = await createSessionToken("Sam");
    expect(passedThrough(await proxy(request("/library", token)))).toBe(true);
    expect(passedThrough(await proxy(request("/api/chat", token)))).toBe(true);
  });

  it("treats an invalid cookie like no cookie", async () => {
    const token = await createSessionToken("Alex");
    vi.stubEnv("APP_PASSCODES", "Alex:a brand new code,Sam:purple monkey dishwasher");
    const page = await proxy(request("/library", token));
    expect(page.headers.get("location")).toBe(
      "http://localhost:3000/unlock?next=%2Flibrary",
    );
    const api = await proxy(request("/api/chat", "garbage"));
    expect(api.status).toBe(401);
  });

  it("fails closed when the secrets are missing", async () => {
    vi.stubEnv("AUTH_SECRET", "");
    await expect(proxy(request("/library", "some.token"))).rejects.toThrow(
      /AUTH_SECRET is missing/,
    );
  });
});
