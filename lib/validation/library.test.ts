import { describe, expect, it } from "vitest";
import { librarySearchParamsSchema, MAX_LIBRARY_QUERY_CHARS } from "./library";

const parse = (params: Record<string, string | string[] | undefined>) =>
  librarySearchParamsSchema.parse(params);

describe("librarySearchParamsSchema", () => {
  it("defaults to no search, newest added first", () => {
    expect(parse({})).toEqual({ q: "", sort: "added" });
  });

  it("reads the search text and sort", () => {
    expect(parse({ q: "  bread  ", sort: "published" })).toEqual({ q: "bread", sort: "published" });
  });

  it("uses the first value when a parameter repeats", () => {
    expect(parse({ q: ["bread", "butter"], sort: ["published", "added"] })).toEqual({
      q: "bread",
      sort: "published",
    });
  });

  it("falls back to date added for an unknown sort", () => {
    expect(parse({ sort: "views" }).sort).toBe("added");
  });

  it("cuts very long search text", () => {
    expect(parse({ q: "a".repeat(500) }).q).toHaveLength(MAX_LIBRARY_QUERY_CHARS);
  });
});
