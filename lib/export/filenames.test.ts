import { describe, expect, it } from "vitest";
import { MAX_FILENAME_LENGTH } from "@/lib/constants";
import {
  assignUniqueFilenames,
  contentDisposition,
  exportFilename,
  exportFilenames,
  sanitizeFilename,
} from "./filenames";

const ID = "abc123xyz00";

// Built from code points, so this file stays plain ASCII.
const FAMILY = String.fromCodePoint(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467);
const GRIN = String.fromCodePoint(0x1f600);
const SUN = String.fromCodePoint(0x65e5); // a CJK character, 3 bytes in UTF-8

const utf8Bytes = (text: string) => new TextEncoder().encode(text).length;

describe("sanitizeFilename", () => {
  it("keeps an ordinary title", () => {
    expect(sanitizeFilename("How Bread Rises", ID)).toBe("How Bread Rises");
  });

  it.each(["\\", "/", ":", "*", "?", '"', "<", ">", "|"])("removes %s", (char) => {
    expect(sanitizeFilename(`Bread${char}Rises`, ID)).toBe("BreadRises");
  });

  it("removes control characters", () => {
    const title = `Bread${String.fromCharCode(0)}Ri${String.fromCharCode(0x7f)}ses${String.fromCharCode(0x85)}`;
    expect(sanitizeFilename(title, ID)).toBe("BreadRises");
  });

  it("collapses whitespace, including tabs and line breaks", () => {
    expect(sanitizeFilename("  Part 1:\tWhy\n bread   rises  ", ID)).toBe("Part 1 Why bread rises");
  });

  it("trims dots and spaces from both ends", () => {
    expect(sanitizeFilename("...Wait for it... ", ID)).toBe("Wait for it");
    expect(sanitizeFilename(".bashrc explained", ID)).toBe("bashrc explained");
  });

  it.each([
    ["CON", "CON_"],
    ["con", "con_"],
    ["Nul", "Nul_"],
    ["aux.txt", "aux_.txt"],
    ["COM1", "COM1_"],
    ["lpt9", "lpt9_"],
    [`COM${String.fromCharCode(0xb9)}`, `COM${String.fromCharCode(0xb9)}_`],
    ["PRN.", "PRN_"],
  ])("renames the reserved name %s", (title, expected) => {
    expect(sanitizeFilename(title, ID)).toBe(expected);
  });

  it.each(["CONSOLE", "CON (live)", "Aux cord review", "COM10"])(
    "leaves %s alone",
    (title) => {
      expect(sanitizeFilename(title, ID)).toBe(title);
    },
  );

  it.each(["", "???", "...", " / : "])("uses the YouTube ID when %j leaves nothing", (title) => {
    expect(sanitizeFilename(title, ID)).toBe(ID);
  });

  it("normalizes to NFC", () => {
    const decomposed = `Cafe${String.fromCharCode(0x301)}`;
    expect(sanitizeFilename(decomposed, ID)).toBe(`Caf${String.fromCharCode(0xe9)}`);
  });

  describe("shortening", () => {
    it("cuts a long title at a word boundary", () => {
      const name = sanitizeFilename("word ".repeat(40), ID);
      expect(name.length).toBeLessThanOrEqual(MAX_FILENAME_LENGTH);
      expect(name).toBe(Array(24).fill("word").join(" "));
    });

    it("cuts inside a word when no space is near the end", () => {
      expect(sanitizeFilename("a".repeat(200), ID)).toBe("a".repeat(MAX_FILENAME_LENGTH));
    });

    it("never splits an emoji sequence", () => {
      const name = sanitizeFilename(`${"a".repeat(118)}${FAMILY}b`, ID);
      expect(name).toBe("a".repeat(118));
    });

    it("counts code points, not UTF-16 units", () => {
      const name = sanitizeFilename(`${"a".repeat(119)}${GRIN}bbb`, ID);
      expect(name).toBe(`${"a".repeat(119)}${GRIN}`);
    });

    it("keeps names within 240 bytes of UTF-8 with the extension", () => {
      const name = sanitizeFilename(SUN.repeat(100), ID);
      expect(name).toBe(SUN.repeat(78));
      expect(utf8Bytes(`${name}.txt`)).toBeLessThanOrEqual(240);
    });

    it("trims a dot left at the cut", () => {
      const name = sanitizeFilename(`${"a".repeat(119)}. more`, ID);
      expect(name).toBe("a".repeat(119));
    });
  });
});

describe("assignUniqueFilenames", () => {
  it("leaves unique names alone", () => {
    expect(assignUniqueFilenames(["Bread", "Butter"])).toEqual(["Bread", "Butter"]);
  });

  it("numbers repeats from 2", () => {
    expect(assignUniqueFilenames(["Bread", "Bread", "Bread"])).toEqual([
      "Bread",
      "Bread (2)",
      "Bread (3)",
    ]);
  });

  it("compares names ignoring case", () => {
    expect(assignUniqueFilenames(["Bread", "BREAD"])).toEqual(["Bread", "BREAD (2)"]);
  });

  it("compares composed and decomposed accents as the same name", () => {
    const composed = `Caf${String.fromCharCode(0xe9)}`;
    const decomposed = `Cafe${String.fromCharCode(0x301)}`;
    expect(assignUniqueFilenames([composed, decomposed])).toEqual([composed, `${decomposed} (2)`]);
  });

  it("lets a title that already ends in (2) keep its name", () => {
    expect(assignUniqueFilenames(["Bread", "Bread", "Bread (2)"])).toEqual([
      "Bread",
      "Bread (3)",
      "Bread (2)",
    ]);
  });

  it("shortens a long name so the suffix still fits", () => {
    const long = "x".repeat(MAX_FILENAME_LENGTH);
    const [, second] = assignUniqueFilenames([long, long]);
    expect(second).toBe(`${"x".repeat(MAX_FILENAME_LENGTH - 4)} (2)`);
  });

  it("keeps the byte limit once the suffix is added", () => {
    const long = sanitizeFilename(SUN.repeat(100), ID);
    const [, second] = assignUniqueFilenames([long, long]);
    expect(second.endsWith(" (2)")).toBe(true);
    expect(utf8Bytes(`${second}.txt`)).toBeLessThanOrEqual(240);
  });
});

describe("exportFilenames and exportFilename", () => {
  it("sanitize, make unique and add .txt", () => {
    expect(
      exportFilenames([
        { title: "Bread: Part 1", youtubeId: "aaaaaaaaaaa" },
        { title: "bread part 1", youtubeId: "bbbbbbbbbbb" },
        { title: "???", youtubeId: "ccccccccccc" },
      ]),
    ).toEqual(["Bread Part 1.txt", "bread part 1 (2).txt", "ccccccccccc.txt"]);
  });

  it("names one file the same way", () => {
    expect(exportFilename({ title: "How Bread Rises?", youtubeId: ID })).toBe("How Bread Rises.txt");
  });
});

describe("contentDisposition", () => {
  it("names an ASCII file both ways", () => {
    expect(contentDisposition("How Bread Rises.txt")).toBe(
      `attachment; filename="How Bread Rises.txt"; filename*=UTF-8''How%20Bread%20Rises.txt`,
    );
  });

  it("encodes other scripts as UTF-8 with an ASCII stand-in", () => {
    expect(contentDisposition(`${SUN}${SUN}.txt`)).toBe(
      `attachment; filename="__.txt"; filename*=UTF-8''%E6%97%A5%E6%97%A5.txt`,
    );
  });

  it("escapes the characters RFC 5987 reserves", () => {
    expect(contentDisposition("It's (live).txt")).toContain(
      "filename*=UTF-8''It%27s%20%28live%29.txt",
    );
  });
});
