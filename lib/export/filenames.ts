import { MAX_FILENAME_LENGTH } from "@/lib/constants";

/** Every exported transcript is a plain-text file. */
export const TRANSCRIPT_EXTENSION = ".txt";

/**
 * Most filesystems allow 255 bytes per name, and ext4 counts them in UTF-8,
 * where a CJK character takes 3. So whole names, extension and any ` (n)`
 * included, stay under this.
 */
const MAX_FILENAME_BYTES = 240;

const MAX_BASE_BYTES = MAX_FILENAME_BYTES - TRANSCRIPT_EXTENSION.length;

// Not allowed in Windows filenames, plus control characters (C0, DEL and C1).
const FORBIDDEN = /[\\/:*?"<>|\x00-\x1F\x7F-\x9F]/g;

// Windows reserves these device names, whatever the case and even with an
// extension after them, as in "con.txt". The superscripts are ¹, ² and ³.
const RESERVED = /^(CON|PRN|AUX|NUL|COM[0-9\xB9\xB2\xB3]|LPT[0-9\xB9\xB2\xB3])(?=\.|$)/i;

// Spaces and dots at either end: Windows drops trailing ones, and a leading
// dot hides the file on macOS and Linux.
const EDGES = /^[ .]+|[ .]+$/g;

const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" });
const utf8 = new TextEncoder();

/**
 * A video title as a filename without its extension:
 * - characters Windows doesn't allow (`\ / : * ? " < > |`) and control
 *   characters are removed
 * - whitespace is collapsed, and spaces and dots are trimmed from both ends
 * - Windows device names such as `CON` get a `_` after them
 * - long titles are shortened to MAX_FILENAME_LENGTH characters, at a word
 *   boundary when there's one near the end, without splitting an emoji
 *
 * Falls back to `fallbackId` (the YouTube ID) when nothing is left.
 */
export function sanitizeFilename(title: string, fallbackId: string): string {
  const cleaned = title
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .replace(FORBIDDEN, "")
    .replace(/ {2,}/g, " ")
    .replace(EDGES, "")
    .replace(RESERVED, "$1_");
  return shorten(cleaned, MAX_FILENAME_LENGTH, MAX_BASE_BYTES) || fallbackId;
}

/**
 * Makes names unique by adding ` (2)`, ` (3)` and so on to repeats. Names are
 * compared ignoring case, as Windows and macOS do. Every name as given is
 * reserved first, so a video really titled "Bread (2)" keeps its name and a
 * second "Bread" becomes "Bread (3)". A name with a suffix is shortened to
 * stay within the length limit.
 */
export function assignUniqueFilenames(names: readonly string[]): string[] {
  const taken = new Set(names.map(foldCase));
  const used = new Set<string>();

  return names.map((name) => {
    const key = foldCase(name);
    if (!used.has(key)) {
      used.add(key);
      return name;
    }
    for (let n = 2; ; n++) {
      const suffix = ` (${n})`;
      const candidate =
        shorten(name, MAX_FILENAME_LENGTH - suffix.length, MAX_BASE_BYTES - suffix.length) +
        suffix;
      const candidateKey = foldCase(candidate);
      if (!taken.has(candidateKey)) {
        taken.add(candidateKey);
        used.add(candidateKey);
        return candidate;
      }
    }
  });
}

/** Each video's .txt filename, unique within the list. */
export function exportFilenames(
  videos: readonly { title: string; youtubeId: string }[],
): string[] {
  const names = videos.map((video) => sanitizeFilename(video.title, video.youtubeId));
  return assignUniqueFilenames(names).map((name) => name + TRANSCRIPT_EXTENSION);
}

/** One video's .txt filename. */
export function exportFilename(video: { title: string; youtubeId: string }): string {
  return sanitizeFilename(video.title, video.youtubeId) + TRANSCRIPT_EXTENSION;
}

/**
 * A Content-Disposition header that downloads the file as `filename`. Browsers
 * read the UTF-8 `filename*`, so titles in any script survive; `filename` is
 * an ASCII stand-in for anything older.
 */
export function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]|["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeRfc5987(filename)}`;
}

/** Percent-encoding for `filename*` (RFC 5987), which also escapes ' ( ) and *. */
function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * `name` cut to at most `maxCodePoints` code points and `maxBytes` UTF-8
 * bytes, between graphemes so an emoji sequence or a flag stays whole. When
 * the cut lands inside a word and there's a space in the last third, it
 * backs up to that space. Spaces and dots left at the end are trimmed.
 */
function shorten(name: string, maxCodePoints: number, maxBytes: number): string {
  if (countCodePoints(name) <= maxCodePoints && utf8.encode(name).length <= maxBytes) {
    return name;
  }

  let cut = "";
  let codePoints = 0;
  let bytes = 0;
  for (const { segment } of graphemes.segment(name)) {
    codePoints += countCodePoints(segment);
    bytes += utf8.encode(segment).length;
    if (codePoints > maxCodePoints || bytes > maxBytes) break;
    cut += segment;
  }

  const midWord = name[cut.length] !== " ";
  const lastSpace = cut.lastIndexOf(" ");
  if (midWord && lastSpace >= (cut.length * 2) / 3) cut = cut.slice(0, lastSpace);
  return cut.replace(EDGES, "");
}

function countCodePoints(text: string): number {
  return [...text].length;
}

/** How two names compare on a case-insensitive filesystem. */
function foldCase(name: string): string {
  return name.normalize("NFC").toLowerCase();
}
