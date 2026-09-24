import { describe, expect, it } from "vitest";
import {
  effectiveStatus,
  formatStageReasons,
  parseStageReasons,
  STALLED_MESSAGE,
  staleCutoff,
} from "./status";

const NOW = new Date("2026-09-24T12:00:00.000Z");
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);

describe("effectiveStatus", () => {
  it("keeps a pending video nobody has started as pending", () => {
    expect(effectiveStatus({ status: "pending", processingStartedAt: null }, NOW)).toEqual({
      status: "pending",
      errorMessage: null,
    });
  });

  it("keeps processing that started under 6 minutes ago as pending", () => {
    for (const started of [minutesAgo(0), minutesAgo(5.9), minutesAgo(6)]) {
      expect(effectiveStatus({ status: "pending", processingStartedAt: started }, NOW)).toEqual({
        status: "pending",
        errorMessage: null,
      });
    }
  });

  it("reports processing that started over 6 minutes ago as failed", () => {
    const started = new Date(minutesAgo(6).getTime() - 1);
    expect(effectiveStatus({ status: "pending", processingStartedAt: started }, NOW)).toEqual({
      status: "failed",
      errorMessage: STALLED_MESSAGE,
    });
  });

  it("passes a failed video's reasons through", () => {
    expect(
      effectiveStatus(
        { status: "failed", processingStartedAt: null, errorMessage: "Captions: none" },
        NOW,
      ),
    ).toEqual({ status: "failed", errorMessage: "Captions: none" });
  });

  it("reports a ready video as ready, whatever else the row holds", () => {
    expect(
      effectiveStatus(
        { status: "ready", processingStartedAt: minutesAgo(60), errorMessage: "old" },
        NOW,
      ),
    ).toEqual({ status: "ready", errorMessage: null });
  });

  it("puts the stall cutoff 6 minutes before now", () => {
    expect(staleCutoff(NOW)).toEqual(minutesAgo(6));
  });
});

describe("stage reasons", () => {
  it("stores one labelled line per stage and reads them back", () => {
    const stored = formatStageReasons([
      { stage: "captions", message: "No English captions. Available: fr, de." },
      { stage: "gemini", message: "Gemini can only\ntranscribe public videos." },
    ]);
    expect(stored).toBe(
      "Captions: No English captions. Available: fr, de.\nGemini: Gemini can only transcribe public videos.",
    );
    expect(parseStageReasons(stored)).toEqual([
      { label: "Captions", message: "No English captions. Available: fr, de." },
      { label: "Gemini", message: "Gemini can only transcribe public videos." },
    ]);
  });

  it("reads a message without a stage, such as a stall", () => {
    expect(parseStageReasons(STALLED_MESSAGE)).toEqual([{ label: null, message: STALLED_MESSAGE }]);
  });
});
