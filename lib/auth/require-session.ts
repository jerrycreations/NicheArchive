import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { UNLOCK_PATH } from "@/lib/auth/next-path";
import { SESSION_COOKIE, verifySessionToken, type Session } from "@/lib/auth/session";
import { SIGNED_OUT, type ErrorBody } from "@/lib/errors";

// The proxy already turns signed-out requests away, but every server action,
// route handler and page that needs to know who's asking checks again: a
// matcher change or a moved action can drop the proxy's coverage without
// any error.

/** Who the request's session cookie belongs to, or null without a valid one. */
export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? verifySessionToken(token) : null;
}

/** For pages and layouts: the session, or a redirect to the unlock page. */
export async function pageSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect(UNLOCK_PATH);
  return session;
}

/** The response signed-out API requests get, from the proxy or a route handler. */
export function unauthorizedResponse(): Response {
  return Response.json({ error: SIGNED_OUT } satisfies ErrorBody, {
    status: 401,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Wraps a route handler so it runs only for a signed-in device, with the
 * session as its first argument; anything else gets unauthorizedResponse().
 * Other errors, such as missing environment variables, still throw.
 */
export function withSession<Args extends unknown[]>(
  handler: (session: Session, ...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args) => {
    const session = await getSession();
    if (!session) return unauthorizedResponse();
    return handler(session, ...args);
  };
}
