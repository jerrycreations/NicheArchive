import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";

export class UnauthorizedError extends Error {
  constructor() {
    super("This device isn't unlocked.");
    this.name = "UnauthorizedError";
  }
}

/**
 * Throws UnauthorizedError unless the request has a valid session cookie.
 * The proxy already turns locked requests away, but every server action and
 * route handler calls this too: a matcher change or a moved action can drop
 * the proxy's coverage without any error.
 */
export async function requireSession(): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !(await verifySessionToken(token))) {
    throw new UnauthorizedError();
  }
}

/** The response locked API requests get, from the proxy or a route handler. */
export function unauthorizedResponse(): Response {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

/**
 * Wraps a route handler so it runs only for an unlocked device; anything else
 * gets unauthorizedResponse(). Other errors, such as missing environment
 * variables, still throw.
 */
export function withSession<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args) => {
    try {
      await requireSession();
    } catch (error) {
      if (error instanceof UnauthorizedError) return unauthorizedResponse();
      throw error;
    }
    return handler(...args);
  };
}
