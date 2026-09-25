"use client";

import { SparklesIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { setPendingStart } from "@/lib/chat/pending-start";

/** Where "Ask Gemini instead" goes: a new Gemini-only chat, which sends the handed-over question. */
const ASK_GEMINI_PATH = "/chats?mode=general";

/**
 * A library answer that found nothing in the videos, with a way to ask plain
 * Gemini instead. The question goes to the new chat through sessionStorage,
 * not the address, and is sent as soon as that chat opens.
 */
export function NoMatchReply({
  question,
  children,
}: {
  /** What the user asked, to ask again; null if it isn't known. */
  question: string | null;
  /** The reply itself. */
  children: React.ReactNode;
}) {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-3">
      {children}
      <p className="text-muted-foreground">
        Answers here come only from your videos. Gemini can answer from general knowledge instead.
      </p>
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => {
          if (question) setPendingStart({ mode: "general", question });
          router.push(ASK_GEMINI_PATH);
        }}
      >
        <SparklesIcon data-icon="inline-start" />
        Ask Gemini instead
      </Button>
    </div>
  );
}
