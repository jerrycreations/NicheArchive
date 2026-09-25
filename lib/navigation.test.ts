import { describe, expect, it } from "vitest";
import { isActivePath, libraryPath, parseStartParam, videoPath } from "./navigation";

describe("libraryPath", () => {
  it("is the plain library with no search and the default sort", () => {
    expect(libraryPath()).toBe("/library");
    expect(libraryPath({ q: "  ", sort: "added" })).toBe("/library");
  });

  it("carries the search text and a non-default sort", () => {
    expect(libraryPath({ q: " bread & butter ", sort: "published" })).toBe(
      "/library?q=bread+%26+butter&sort=published",
    );
    expect(libraryPath({ sort: "published" })).toBe("/library?sort=published");
  });
});

describe("videoPath", () => {
  it("links to the video's page by its YouTube ID", () => {
    expect(videoPath("dQw4w9WgXcQ")).toBe("/videos/dQw4w9WgXcQ");
  });
});

describe("parseStartParam", () => {
  const HOUR_LONG = 3600;

  it.each([
    ["95", 95],
    ["95s", 95],
    ["0", 0],
    ["1m30", 90],
    ["1m30s", 90],
    ["2m", 120],
    [" 42 ", 42],
  ])("reads %j as %i seconds", (value, seconds) => {
    expect(parseStartParam(value, HOUR_LONG)).toBe(seconds);
  });

  it("reads hours, minutes and seconds together", () => {
    expect(parseStartParam("1h2m3s", 2 * HOUR_LONG)).toBe(3723);
    expect(parseStartParam("1h", 2 * HOUR_LONG)).toBe(3600);
  });

  it("uses the first value when the parameter repeats", () => {
    expect(parseStartParam(["30", "60"], HOUR_LONG)).toBe(30);
  });

  it.each([undefined, "", "abc", "-5", "1.5", "1:30", "s", "1h2x"])(
    "starts %j from the beginning",
    (value) => {
      expect(parseStartParam(value, HOUR_LONG)).toBe(0);
    },
  );

  it("starts from the beginning when the time is at or past the end", () => {
    expect(parseStartParam("213", 214)).toBe(213);
    expect(parseStartParam("214", 214)).toBe(0);
    expect(parseStartParam("5000", 214)).toBe(0);
  });
});

describe("isActivePath", () => {
  it.each([
    ["/library", "/library"],
    ["/library/", "/library"],
    ["/chats", "/chats"],
    ["/chats/0b6c3a8e-5d1f-4a52-9d6e-2f7c1e9a4b3d", "/chats"],
  ])("marks %j as inside %j", (pathname, href) => {
    expect(isActivePath(pathname, href)).toBe(true);
  });

  it.each([
    ["/libraryx", "/library"],
    ["/chatsroom", "/chats"],
    ["/videos/dQw4w9WgXcQ", "/library"],
    ["/videos/dQw4w9WgXcQ", "/chats"],
    ["/", "/library"],
    ["/dev/captions", "/library"],
  ])("doesn't mark %j as inside %j", (pathname, href) => {
    expect(isActivePath(pathname, href)).toBe(false);
  });
});
