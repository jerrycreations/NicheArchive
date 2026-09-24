// Server actions return a result tagged by `kind` instead of throwing, so the
// client can show every outcome. Any action can also return an ActionError.

/** A failure whose `message` is written for the user. */
export type ActionError = { kind: "error"; message: string };

export function actionError(message: string): ActionError {
  return { kind: "error", message };
}

/**
 * For failures nobody planned for, such as an unreachable database: logs the
 * real error on the server and gives the user a message that's safe to show.
 */
export function unexpectedError(
  context: string,
  error: unknown,
  message = "Something went wrong on the server. Try again.",
): ActionError {
  console.error(`${context} failed:`, error);
  return actionError(message);
}
