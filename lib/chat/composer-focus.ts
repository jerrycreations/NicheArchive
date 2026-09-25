// A new chat on the Chats page gives way to the saved chat's own page once
// its first answer is in, which mounts a new composer. This carries the old
// composer's focus over, so a follow-up can be typed straight away.

let chatIdToFocus: string | null = null;

/** The next composer to mount for this chat takes focus. */
export function carryComposerFocus(chatId: string): void {
  chatIdToFocus = chatId;
}

/** Whether this chat's composer should take focus as it mounts. Answers yes once. */
export function takeComposerFocus(chatId: string): boolean {
  if (chatIdToFocus !== chatId) return false;
  chatIdToFocus = null;
  return true;
}
