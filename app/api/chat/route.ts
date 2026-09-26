import { withSession } from "@/lib/auth/require-session";
import { chatErrorResponse } from "@/lib/chat/errors";
import { respondToChat } from "@/lib/chat/respond";
import { serverErrorResponse } from "@/lib/errors";
import { chatRequestSchema } from "@/lib/validation/chat";

// postgres.js needs Node.js.
export const runtime = "nodejs";

// A streamed answer, even with a long video's whole transcript, finishes well
// within a minute.
export const maxDuration = 60;

/**
 * Answers a chat message, streaming the reply. The body names the chat and
 * carries only the new message; the server loads the earlier ones. The chat
 * belongs to whoever is signed in.
 */
export const POST = withSession(async (session, request: Request) => {
  const parsed = chatRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const textIssue = parsed.error.issues.find(
      (issue) => issue.path[0] === "message" && issue.path[1] === "text",
    );
    return chatErrorResponse(textIssue?.message ?? "That isn't a valid chat request.", 400);
  }

  try {
    return await respondToChat(parsed.data, session.person);
  } catch (error) {
    // Failures before the answer starts, such as an unreachable database.
    return serverErrorResponse("POST /api/chat", error);
  }
});
