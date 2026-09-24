import { describe, expect, it } from "vitest";
import { buildThumbnailUrl, buildWatchUrl, parseYouTubeUrl } from "./url";

const ID = "dQw4w9WgXcQ";

describe("parseYouTubeUrl", () => {
  it.each([
    // watch
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}`,
    `http://www.youtube.com/watch?v=${ID}`,
    `https://www.youtube.com/watch?v=${ID}&t=42s`,
    `https://www.youtube.com/watch?v=${ID}&list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG&index=2`,
    `https://www.youtube.com/watch?feature=share&v=${ID}`,
    `https://www.youtube.com/watch?v=${ID}#t=30`,
    // short links
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?si=Ab12Cd34Ef56Gh78`,
    `https://youtu.be/${ID}?t=95`,
    // path forms
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/shorts/${ID}?feature=share`,
    `https://www.youtube.com/shorts/${ID}/`,
    `https://www.youtube.com/embed/${ID}?start=30`,
    `https://www.youtube.com/live/${ID}?si=xyz`,
    // other hosts
    `https://m.youtube.com/watch?v=${ID}&feature=youtu.be`,
    `https://music.youtube.com/watch?v=${ID}&si=abc`,
    `https://www.youtube-nocookie.com/embed/${ID}`,
    `https://youtube-nocookie.com/embed/${ID}`,
    `https://www.youtube.com./watch?v=${ID}`,
    `HTTPS://WWW.YOUTUBE.COM/watch?v=${ID}`,
    // no protocol
    `youtube.com/watch?v=${ID}`,
    `www.youtube.com/shorts/${ID}`,
    `m.youtube.com/watch?v=${ID}`,
    `youtu.be/${ID}`,
    `//www.youtube.com/watch?v=${ID}`,
    // bare ID and whitespace
    ID,
    `  https://youtu.be/${ID}\n`,
  ])("accepts %s", (input) => {
    expect(parseYouTubeUrl(input)).toEqual({ ok: true, id: ID });
  });

  it("keeps IDs containing - and _ intact", () => {
    expect(parseYouTubeUrl("https://youtu.be/a-b_c1D2e3F")).toEqual({
      ok: true,
      id: "a-b_c1D2e3F",
    });
    expect(parseYouTubeUrl("a-b_c1D2e3F")).toEqual({
      ok: true,
      id: "a-b_c1D2e3F",
    });
  });

  it.each(["", "   ", "\n\t"])("rejects empty input %j", (input) => {
    expect(parseYouTubeUrl(input)).toEqual({ ok: false, reason: "empty" });
  });

  it.each([
    `https://evil.com/watch?v=${ID}`,
    `https://youtube.com.evil.com/watch?v=${ID}`,
    `https://notyoutube.com/watch?v=${ID}`,
    `https://youtube.com@evil.com/watch?v=${ID}`,
    `https://evil.com/?u=https://www.youtube.com/watch?v=${ID}`,
    `https://youtu.be.evil.com/${ID}`,
    `javascript:alert(1)`,
    `javascript://www.youtube.com/watch?v=${ID}`,
    `data:text/html,<script>alert(1)</script>`,
    `ftp://youtube.com/watch?v=${ID}`,
    "not a url at all",
  ])("rejects non-YouTube input %s", (input) => {
    expect(parseYouTubeUrl(input)).toEqual({
      ok: false,
      reason: "not_youtube",
    });
  });

  it.each([
    "https://www.youtube.com/watch?v=dQw4w9WgXc", // 10 characters
    "https://www.youtube.com/watch?v=dQw4w9WgXcQX", // 12 characters
    "https://youtu.be/dQw4w9WgXcQX",
    "https://www.youtube.com/shorts/dQw4w9WgXc",
    "https://www.youtube.com/watch?v=dQw4w9WgXc!",
    "https://www.youtube.com/watch?v=dQw4w9%20gXc",
    "https://www.youtube.com/watch",
    "https://www.youtube.com/",
    "https://youtu.be/",
    "https://www.youtube.com/channel/UCuAXFkgsw1L7xaCfnd5JJOw",
    "https://www.youtube.com/@somechannel",
    "https://www.youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG",
    "https://www.youtube.com/shorts/",
    `https://www.youtube.com/results?search_query=${ID}`,
  ])("rejects YouTube links without a valid video ID: %s", (input) => {
    expect(parseYouTubeUrl(input)).toEqual({
      ok: false,
      reason: "no_video_id",
    });
  });

  it("does not treat bare strings of the wrong length as IDs", () => {
    expect(parseYouTubeUrl("dQw4w9WgXc").ok).toBe(false);
    expect(parseYouTubeUrl("dQw4w9WgXcQX").ok).toBe(false);
  });
});

describe("URL builders", () => {
  it("builds the canonical watch URL", () => {
    expect(buildWatchUrl(ID)).toBe(`https://www.youtube.com/watch?v=${ID}`);
  });

  it("builds the hqdefault thumbnail URL", () => {
    expect(buildThumbnailUrl(ID)).toBe(
      `https://i.ytimg.com/vi/${ID}/hqdefault.jpg`,
    );
  });

  it("round-trips through the parser", () => {
    expect(parseYouTubeUrl(buildWatchUrl(ID))).toEqual({ ok: true, id: ID });
  });
});
