import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  requireSession,
  UnauthorizedError,
  withSession,
} from "./require-session";
import { createSessionToken, SESSION_COOKIE } from "./session";

const cookieValue = vi.fn<(name: string) => string | undefined>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieValue(name);
      return value === undefined ? undefined : { name, value };
    },
  }),
}));

beforeEach(() => {
  cookieValue.mockReset();
  vi.stubEnv("APP_PASSCODE", "correct horse battery staple");
  vi.stubEnv("AUTH_SECRET", "s".repeat(32));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function unlock() {
  const token = await createSessionToken();
  cookieValue.mockImplementation((name) =>
    name === SESSION_COOKIE ? token : undefined,
  );
}

describe("requireSession", () => {
  it("throws UnauthorizedError without a session cookie", async () => {
    await expect(requireSession()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("throws UnauthorizedError for an invalid token", async () => {
    cookieValue.mockReturnValue("not.a-token");
    await expect(requireSession()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("passes for a valid session", async () => {
    await unlock();
    await expect(requireSession()).resolves.toBeUndefined();
  });
});

describe("withSession", () => {
  const handler = vi.fn(async (request: Request) =>
    Response.json({ path: new URL(request.url).pathname }),
  );
  const request = new Request("http://localhost/api/example");

  beforeEach(() => {
    handler.mockClear();
  });

  it("answers 401 JSON without calling the handler", async () => {
    const response = await withSession(handler)(request);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("calls the handler with its arguments for a valid session", async () => {
    await unlock();
    const response = await withSession(handler)(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ path: "/api/example" });
    expect(handler).toHaveBeenCalledWith(request);
  });

  it("lets configuration errors through instead of answering 401", async () => {
    cookieValue.mockReturnValue("some.token");
    vi.stubEnv("AUTH_SECRET", "");
    await expect(withSession(handler)(request)).rejects.toThrow(
      /AUTH_SECRET is missing/,
    );
  });
});
