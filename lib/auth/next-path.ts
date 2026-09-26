// Where to go after unlocking. Only paths on this site are allowed, so a
// crafted /unlock?next= link can't send anyone elsewhere.

export const UNLOCK_PATH = "/unlock";
export const DEFAULT_NEXT_PATH = "/library";

const BASE = new URL("http://nichearchive.invalid");

export function safeNextPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/")) {
    return DEFAULT_NEXT_PATH;
  }
  // "//host" is protocol-relative, and browsers read "/\host" the same way.
  if (value.startsWith("//") || value.startsWith("/\\")) {
    return DEFAULT_NEXT_PATH;
  }
  // Browsers drop tabs and newlines from URLs, which can turn "/\t/host"
  // into "//host", so refuse control characters outright.
  if ([...value].some((char) => char.charCodeAt(0) < 32 || char === "\x7f")) {
    return DEFAULT_NEXT_PATH;
  }

  const url = new URL(value, BASE);
  if (url.origin !== BASE.origin) return DEFAULT_NEXT_PATH;
  // Unlocking and landing back on the unlock page would look like a failure.
  if (url.pathname === UNLOCK_PATH || url.pathname.startsWith(`${UNLOCK_PATH}/`)) {
    return DEFAULT_NEXT_PATH;
  }
  return url.pathname + url.search + url.hash;
}
