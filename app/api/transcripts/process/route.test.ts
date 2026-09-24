import { after } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { claimForProcessing, getVideoByYoutubeId } from "@/lib/db/queries/videos";
import type { VideoRow } from "@/lib/db/types";
import { processVideoTranscript } from "@/lib/transcript/pipeline";
import { POST } from "./route";

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: vi.fn(),
}));
vi.mock("@/lib/db/queries/videos", () => ({
  getVideoByYoutubeId: vi.fn(),
  claimForProcessing: vi.fn(),
}));
vi.mock("@/lib/transcript/pipeline", () => ({ processVideoTranscript: vi.fn() }));

const ID = "dQw4w9WgXcQ";
const CLAIMED_AT = new Date("2026-09-24T12:00:00.123Z");

const video = (status: VideoRow["status"]) =>
  ({ id: "7d3f7c52-5f1e-4a3b-9a57-2f1c7e4b8d10", youtubeId: ID, status }) as VideoRow;

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/transcripts/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

async function expectOutcome(response: Response, status: number, outcome: string) {
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ outcome });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getVideoByYoutubeId).mockResolvedValue(video("pending"));
  vi.mocked(claimForProcessing).mockResolvedValue(CLAIMED_AT);
});

describe("POST /api/transcripts/process", () => {
  it("claims the video, answers 202 and does the work after the response", async () => {
    await expectOutcome(await post({ youtubeId: ID }), 202, "started");
    expect(claimForProcessing).toHaveBeenCalledWith(video("pending").id, expect.any(Date));
    expect(processVideoTranscript).not.toHaveBeenCalled();

    // The callback passed to after() is the work itself.
    const [work] = vi.mocked(after).mock.calls[0];
    await (work as () => Promise<void>)();
    expect(processVideoTranscript).toHaveBeenCalledExactlyOnceWith(video("pending"), CLAIMED_AT);
  });

  it("retries a failed video the same way", async () => {
    vi.mocked(getVideoByYoutubeId).mockResolvedValue(video("failed"));
    await expectOutcome(await post({ youtubeId: ID }), 202, "started");
    expect(after).toHaveBeenCalledOnce();
  });

  it("does nothing when another run holds the claim", async () => {
    vi.mocked(claimForProcessing).mockResolvedValue(null);
    await expectOutcome(await post({ youtubeId: ID }), 202, "already_running");
    expect(after).not.toHaveBeenCalled();
  });

  it("answers 200 for a video that's already ready", async () => {
    vi.mocked(getVideoByYoutubeId).mockResolvedValue(video("ready"));
    await expectOutcome(await post({ youtubeId: ID }), 200, "ready");
    expect(claimForProcessing).not.toHaveBeenCalled();
  });

  it("answers 404 for a video that isn't saved", async () => {
    vi.mocked(getVideoByYoutubeId).mockResolvedValue(null);
    await expectOutcome(await post({ youtubeId: ID }), 404, "not_found");
  });

  it.each([
    ["no body", ""],
    ["a bad ID", { youtubeId: "not-an-id" }],
    ["a missing ID", {}],
  ])("rejects %s with 400", async (_, body) => {
    const response = await post(body);
    expect(response.status).toBe(400);
    expect(getVideoByYoutubeId).not.toHaveBeenCalled();
  });
});
