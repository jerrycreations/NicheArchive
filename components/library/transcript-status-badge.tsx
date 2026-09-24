import { Badge } from "@/components/ui/badge";
import type { TranscriptStatus } from "@/lib/transcript/types";

/**
 * A video's transcript state. "Transcript ready" stays neutral; processing
 * and failed use the two status colors, the app's only colors besides errors.
 */
export function TranscriptStatusBadge({ status }: { status: TranscriptStatus }) {
  switch (status) {
    case "ready":
      return (
        <Badge variant="outline" className="text-muted-foreground">
          Transcript ready
        </Badge>
      );
    case "pending":
      return (
        <Badge className="bg-status-processing/15 text-status-processing">
          Processing
        </Badge>
      );
    case "failed":
      return <Badge className="bg-status-failed/15 text-status-failed">Failed</Badge>;
  }
}
