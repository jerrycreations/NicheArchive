import { describe, expect, it } from "vitest";
import { isActivePath } from "./navigation";

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
