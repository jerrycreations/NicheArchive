import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn();

const deleteStaleUnlockAttempts = vi.fn();

vi.mock("@/lib/db", () => ({ db: () => ({ execute }) }));
vi.mock("@/lib/db/queries/unlock-attempts", () => ({ deleteStaleUnlockAttempts }));

const SECRET = "cron-secret-for-tests";

function ping(authorization?: string) {
  const headers = authorization ? { authorization } : undefined;
  return new Request("http://localhost/api/cron/ping", { headers });
}

async function loadGet() {
  return (await import("./route")).GET;
}

beforeEach(() => {
  execute.mockReset();
  deleteStaleUnlockAttempts.mockReset();
  vi.stubEnv("CRON_SECRET", SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/cron/ping", () => {
  it("rejects a request with no Authorization header", async () => {
    const GET = await loadGet();
    const response = await GET(ping());
    expect(response.status).toBe(401);
    expect(execute).not.toHaveBeenCalled();
    expect(deleteStaleUnlockAttempts).not.toHaveBeenCalled();
  });

  it("rejects the wrong secret", async () => {
    const GET = await loadGet();
    const response = await GET(ping("Bearer not-the-secret"));
    expect(response.status).toBe(401);
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects the right secret without the Bearer prefix", async () => {
    const GET = await loadGet();
    const response = await GET(ping(SECRET));
    expect(response.status).toBe(401);
  });

  it("queries the database and clears old unlock tries with the right secret", async () => {
    const GET = await loadGet();
    const response = await GET(ping(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(Number.isNaN(Date.parse(body.at))).toBe(false);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(deleteStaleUnlockAttempts).toHaveBeenCalledTimes(1);
  });

  it("works while unrelated variables are still blank", async () => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "");
    vi.stubEnv("YOUTUBE_API_KEY", "");
    const GET = await loadGet();
    const response = await GET(ping(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
  });
});
