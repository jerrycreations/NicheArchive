// Server actions return a result tagged by `kind` instead of throwing, so the
// client can show every outcome. Any action can also return an ActionError.
import { DATABASE_UNREACHABLE, isDatabaseUnreachable, SERVER_PROBLEM } from "@/lib/errors";

/** A failure whose `message` is written for the user. */
export type ActionError = { kind: "error"; message: string };

export function actionError(message: string): ActionError {
  return { kind: "error", message };
}

/**
 * For failures nobody planned for: logs the real error on the server and
 * gives the user a message that's safe to show. An unreachable database gets
 * its own message whatever `message` says, since trying again won't help
 * until the database is back.
 */
export function unexpectedError(
  context: string,
  error: unknown,
  message = SERVER_PROBLEM,
): ActionError {
  console.error(`${context} failed:`, error);
  return actionError(isDatabaseUnreachable(error) ? DATABASE_UNREACHABLE : message);
}
