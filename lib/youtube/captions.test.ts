import { describe, expect, it } from "vitest";
import { pickEnglishTrack, type CaptionTrack } from "./captions";

const manual = (languageCode: string): CaptionTrack => ({ languageCode });
const auto = (languageCode: string): CaptionTrack => ({ languageCode, kind: "asr" });

describe("pickEnglishTrack", () => {
  it("prefers the manual track over the auto-generated one, whichever comes first", () => {
    const manualEn = manual("en");
    expect(pickEnglishTrack([auto("en"), manualEn])).toBe(manualEn);
    expect(pickEnglishTrack([manualEn, auto("en")])).toBe(manualEn);
  });

  it("prefers a manual English variant over an auto-generated en track", () => {
    const manualGb = manual("en-GB");
    expect(pickEnglishTrack([auto("en"), manual("fr"), manualGb])).toBe(manualGb);
  });

  it("takes the first manual English track when there are several", () => {
    const manualUs = manual("en-US");
    expect(pickEnglishTrack([manualUs, manual("en"), manual("en-GB")])).toBe(manualUs);
  });

  it("falls back to the auto-generated English track", () => {
    const autoEn = auto("en");
    expect(pickEnglishTrack([manual("es"), autoEn, auto("de")])).toBe(autoEn);
  });

  it("treats kinds other than asr as manual", () => {
    const forced = { languageCode: "en", kind: "forced" };
    expect(pickEnglishTrack([auto("en"), forced])).toBe(forced);
  });

  it.each([
    [[]],
    [[manual("es"), auto("fr")]],
    [[manual("eng"), manual("enm"), manual("ben"), manual("xen")]],
  ])("returns null without an English track (%j)", (tracks) => {
    expect(pickEnglishTrack(tracks)).toBeNull();
  });

  it("matches English codes case-insensitively", () => {
    const upper = manual("EN-gb");
    expect(pickEnglishTrack([upper])).toBe(upper);
  });
});
