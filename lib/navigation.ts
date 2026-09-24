/** The top bar's links, shared by the desktop links and the small-screen menu. */
export const NAV_ITEMS = [
  { href: "/library", label: "Library" },
  { href: "/chats", label: "Chats" },
] as const;

/**
 * Whether `href` is the current section: the page itself or any page below it,
 * so `/chats/<id>` keeps Chats highlighted. `/libraryx` doesn't match `/library`.
 */
export function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
