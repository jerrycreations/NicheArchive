import { describe, expect, it } from "vitest";
import { validateGeminiSegments, type GeminiSegment } from "./transcribe-validate";

const seg = (start: string, text = "Some words were said here.") => ({ start, text });

function expectOk(raw: GeminiSegment[], durationSeconds: number) {
  const result = validateGeminiSegments(raw, durationSeconds);
  if (!result.ok) throw new Error(`Expected segments, got ${result.reason}: ${result.detail}`);
  return result.segments;
}

describe("validateGeminiSegments", () => {
  it("parses start times and runs each duration to the next start", () => {
    expect(
      expectOk([seg("0:00", "Hello there."), seg("0:04", "General Kenobi, you are a bold one.")], 60),
    ).toEqual([
      { start: 0, duration: 4, text: "Hello there." },
      { start: 4, duration: 7 / 2.5, text: "General Kenobi, you are a bold one." },
    ]);
  });

  it("reads mm:ss and h:mm:ss, and drops fractions of a second", () => {
    const segments = expectOk([seg("00:05"), seg("01:15.5"), seg("1:02:03")], 4000);
    expect(segments.map((segment) => segment.start)).toEqual([5, 75, 3723]);
  });

  it("sorts segments into order", () => {
    const segments = expectOk([seg("0:10", "b"), seg("0:00", "a"), seg("0:20", "c")], 60);
    expect(segments.map((segment) => segment.text)).toEqual(["a", "b", "c"]);
  });

  it("keeps a segment up to 5 seconds past the end, and drops a few later ones", () => {
    const raw = [
      ...Array.from({ length: 9 }, (_, index) => seg(`0:0${index}`)),
      seg("1:05"), // 5 s past the end of a 60 s video: kept
      seg("1:06"), // dropped
    ];
    const segments = expectOk(raw, 60);
    expect(segments).toHaveLength(10);
    expect(segments.at(-1)?.start).toBe(65);
  });

  it("collapses whitespace and ignores segments without text", () => {
    const segments = expectOk([seg("0:00", "  one\n two "), seg("0:03", "   "), seg("0:05")], 60);
    expect(segments.map((segment) => segment.text)).toEqual(["one two", "Some words were said here."]);
  });

  it("fails as no_speech when nothing was said", () => {
    expect(validateGeminiSegments([], 60)).toMatchObject({ ok: false, reason: "no_speech" });
    expect(validateGeminiSegments([seg("0:00", " ")], 60)).toMatchObject({
      ok: false,
      reason: "no_speech",
    });
  });

  it("fails when more than a fifth of the start times are unusable", () => {
    const raw = [seg("0:00"), seg("0:05"), seg("0:10"), seg("soon"), seg("9:99")];
    expect(validateGeminiSegments(raw, 60)).toEqual({
      ok: false,
      reason: "bad_timestamps",
      detail: "2 of 5 segments had a start time that was unreadable or past the end of the video.",
    });
  });

  it("accepts exactly a fifth dropped", () => {
    const raw = [seg("0:00"), seg("0:05"), seg("0:10"), seg("0:15"), seg("45:00")];
    expect(expectOk(raw, 60)).toHaveLength(4);
  });

  it("fails when none of the start times are usable", () => {
    expect(validateGeminiSegments([seg("later")], 60)).toMatchObject({
      ok: false,
      reason: "bad_timestamps",
    });
  });
});
