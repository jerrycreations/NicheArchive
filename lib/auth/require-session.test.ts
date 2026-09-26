import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SIGNED_OUT } from "@/lib/errors";
import { getSession, pageSession, withSession } from "./require-session";
import { createSessionToken, SESSION_COOKIE, type Session } from "./session";

const cookieValue = vi.fn<(name: string) => string | undefined>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieValue(name);
      return value === undefined ? undefined : { name, value };
    },
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    // Like Next's redirect(), it never returns.
    throw new Error(`redirect:${url}`);
  },
}));

beforeEach(() => {
  cookieValue.mockReset();
  vi.stubEnv("APP_PASSCODES", "Alex:correct horse battery staple,Sam:purple monkey dishwasher");
  vi.stubEnv("AUTH_SECRET", "s".repeat(32));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function signIn(person: string) {
  const token = await createSessionToken(person);
  cookieValue.mockImplementation((name) => (name === SESSION_COOKIE ? token : undefined));
}

describe("getSession", () => {
  it("is null without a session cookie", async () => {
    expect(await getSession()).toBeNull();
  });

  it("is null for an invalid token", async () => {
    cookieValue.mockReturnValue("not.a-token");
    expect(await getSession()).toBeNull();
  });

  it("names who is signed in", async () => {
    await signIn("Sam");
    expect(await getSession()).toEqual({ person: "Sam" });
  });
});

describe("pageSession", () => {
  it("sends a signed-out page to the unlock page", async () => {
    await expect(pageSession()).rejects.toThrow("redirect:/unlock");
  });

  it("returns the session when signed in", async () => {
    await signIn("Alex");
    expect(await pageSession()).toEqual({ person: "Alex" });
  });
});

describe("withSession", () => {
  const handler = vi.fn(async (session: Session, request: Request) =>
    Response.json({ person: session.person, path: new URL(request.url).pathname }),
  );
  const request = new Request("http://localhost/api/example");

  beforeEach(() => {
    handler.mockClear();
  });

  it("answers 401 JSON without calling the handler", async () => {
    const response = await withSession(handler)(request);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: SIGNED_OUT });
    expect(handler).not.toHaveBeenCalled();
  });

  it("calls the handler with the session and its arguments", async () => {
    await signIn("Alex");
    const response = await withSession(handler)(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ person: "Alex", path: "/api/example" });
    expect(handler).toHaveBeenCalledWith({ person: "Alex" }, request);
  });

  it("lets configuration errors through instead of answering 401", async () => {
    cookieValue.mockReturnValue("some.token");
    vi.stubEnv("AUTH_SECRET", "");
    await expect(withSession(handler)(request)).rejects.toThrow(/AUTH_SECRET is missing/);
  });
});
