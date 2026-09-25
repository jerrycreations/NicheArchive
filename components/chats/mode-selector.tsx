"use client";

import { ChatModeIcon } from "@/components/chats/mode-icon";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CHAT_MODE_LABELS } from "@/lib/chat/modes";
import { CHAT_MODES, type ChatMode } from "@/lib/chat/types";

/** One video, All my videos or Gemini only, as one segmented control. */
export function ModeSelector({
  value,
  onChange,
}: {
  value: ChatMode;
  onChange: (mode: ChatMode) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      spacing={0}
      value={value}
      // Clicking the chosen mode again would clear it; one is always chosen.
      onValueChange={(next) => {
        if (next) onChange(next as ChatMode);
      }}
      aria-label="What to ask about"
      className="w-full"
    >
      {CHAT_MODES.map((mode) => (
        // Icons only from `sm`, so the three labels fit a 320px phone.
        <ToggleGroupItem key={mode} value={mode} className="flex-1 px-1.5 sm:px-2.5">
          <ChatModeIcon mode={mode} className="max-sm:hidden" />
          {CHAT_MODE_LABELS[mode]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
