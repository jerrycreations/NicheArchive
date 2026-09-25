import { describe, expect, it } from "vitest";
import { escapeLike } from "./like";

describe("escapeLike", () => {
  it.each([
    ["%", "\\%"],
    ["_", "\\_"],
    ["\\", "\\\\"],
  ])("escapes %s", (text, expected) => {
    expect(escapeLike(text)).toBe(expected);
  });

  it("escapes every wildcard in mixed text", () => {
    expect(escapeLike("100% of my_videos\\")).toBe("100\\% of my\\_videos\\\\");
  });

  it("leaves plain text alone", () => {
    expect(escapeLike("How Bread Rises")).toBe("How Bread Rises");
  });
});
