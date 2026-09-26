import { describe, expect, it } from "vitest";
import { safeNextPath } from "./next-path";

describe("safeNextPath", () => {
  it.each([
    ["/library", "/library"],
    ["/videos/dQw4w9WgXcQ?t=95", "/videos/dQw4w9WgXcQ?t=95"],
    ["/chats/0b6c3a8e-5d1f-4a52-9d6e-2f7c1e9a4b3d#latest", "/chats/0b6c3a8e-5d1f-4a52-9d6e-2f7c1e9a4b3d#latest"],
    ["/", "/"],
    ["/a/../library", "/library"],
  ])("keeps the local path %j", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    undefined,
    null,
    42,
    ["/library"],
    "",
    "library",
    "https://evil.example/",
    "javascript:alert(1)",
    "//evil.example",
    "//evil.example/library",
    "/\\evil.example",
    "/\t/evil.example",
    "/\n/evil.example",
    "/unlock",
    "/unlock?next=/library",
    "/library/../unlock",
  ])("falls back to /library for %j", (input) => {
    expect(safeNextPath(input)).toBe("/library");
  });
});
