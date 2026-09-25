import { LibraryBigIcon, SparklesIcon, TvMinimalPlayIcon, type LucideIcon } from "lucide-react";
import type { ChatMode } from "@/lib/chat/types";

const ICONS: Record<ChatMode, LucideIcon> = {
  video: TvMinimalPlayIcon,
  library: LibraryBigIcon,
  general: SparklesIcon,
};

/** A chat mode's icon. Decorative: its label is always shown beside it. */
export function ChatModeIcon({ mode, className }: { mode: ChatMode; className?: string }) {
  const Icon = ICONS[mode];
  return <Icon aria-hidden className={className} />;
}
