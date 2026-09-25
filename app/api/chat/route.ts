import { chatErrorResponse } from "@/lib/chat/errors";
import { respondToChat } from "@/lib/chat/respond";
import { chatRequestSchema } from "@/lib/validation/chat";

// postgres.js needs Node.js.
export const runtime = "nodejs";

// A streamed answer, even with a long video's whole transcript, finishes well
// within a minute.
export const maxDuration = 60;

/**
 * Answers a chat message, streaming the reply. The body names the chat and
 * carries only the new message; the server loads the earlier ones.
 */
export async function POST(request: Request) {
  const parsed = chatRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const textIssue = parsed.error.issues.find(
      (issue) => issue.path[0] === "message" && issue.path[1] === "text",
    );
    return chatErrorResponse(textIssue?.message ?? "That isn't a valid chat request.", 400);
  }

  try {
    return await respondToChat(parsed.data);
  } catch (error) {
    // Failures before the answer starts, such as an unreachable database.
    console.error("POST /api/chat failed:", error);
    return chatErrorResponse("Something went wrong on the server. Try again.", 500);
  }
}
