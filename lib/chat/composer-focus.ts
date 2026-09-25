// A new chat on the Chats page gives way to the saved chat's own page once
// its first answer is in, which mounts a new composer. This carries the old
// composer's focus over, so a follow-up can be typed straight away.
// "Continue with this video" asks the same of the next new chat, which has
// no ID until its first question.

// Stands for a new chat. Not a UUID, so no saved chat can match it.
const NEW_CHAT = "new";

let chatIdToFocus: string | null = null;

/** The next composer to mount for this chat takes focus. */
export function carryComposerFocus(chatId: string): void {
  chatIdToFocus = chatId;
}

/** The next new chat's composer takes focus as it mounts. */
export function carryNewChatFocus(): void {
  chatIdToFocus = NEW_CHAT;
}

/**
 * Whether this chat's composer, or with no ID a new chat's, should take
 * focus as it mounts. Answers yes once.
 */
export function takeComposerFocus(chatId: string | undefined): boolean {
  if (chatIdToFocus !== (chatId ?? NEW_CHAT)) return false;
  chatIdToFocus = null;
  return true;
}
