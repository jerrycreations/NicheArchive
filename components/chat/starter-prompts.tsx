import { Button } from "@/components/ui/button";
import { STARTER_PROMPTS } from "@/lib/chat/starters";

/** Summarize, Key takeaways and Outline: one click sends the question. */
export function StarterPrompts({
  onSelect,
  disabled = false,
}: {
  onSelect: (prompt: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Ask anything about this video, or start with one of these.
      </p>
      <div className="flex flex-wrap gap-2">
        {STARTER_PROMPTS.map((starter) => (
          <Button
            key={starter.id}
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => onSelect(starter.prompt)}
          >
            {starter.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
