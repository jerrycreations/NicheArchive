import { beforeEach, describe, expect, it, vi } from "vitest";
import { listVideoStatuses } from "@/lib/db/queries/videos";
import { GET } from "./route";

vi.mock("@/lib/db/queries/videos", () => ({ listVideoStatuses: vi.fn() }));

const A = "dQw4w9WgXcQ";
const B = "jNQXAC9IVRw";

function get(query: string) {
  return GET(new Request(`http://localhost/api/videos/status${query}`));
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listVideoStatuses).mockResolvedValue([
    { youtubeId: A, status: "ready", source: "manual_captions", errorMessage: null },
  ]);
});

describe("GET /api/videos/status", () => {
  it("returns the statuses of the requested videos, uncached", async () => {
    const response = await get(`?ids=${A},${B}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual([
      { youtubeId: A, status: "ready", source: "manual_captions", errorMessage: null },
    ]);
    expect(listVideoStatuses).toHaveBeenCalledWith([A, B]);
  });

  it("accepts an encoded comma, spaces and repeats", async () => {
    await get(`?ids=${A}%2C%20${B}%2C${A}`);
    expect(listVideoStatuses).toHaveBeenCalledWith([A, B]);
  });

  it.each([
    ["no ids", ""],
    ["an empty list", "?ids="],
    ["a bad ID", `?ids=${A},nope`],
    ["too many IDs", `?ids=${Array.from({ length: 101 }, (_, i) => `v${String(i).padStart(10, "0")}`).join(",")}`],
  ])("rejects %s with 400", async (_, query) => {
    const response = await get(query);
    expect(response.status).toBe(400);
    expect(listVideoStatuses).not.toHaveBeenCalled();
  });
});
