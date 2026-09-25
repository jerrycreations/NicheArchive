"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VIDEO_SORTS, type VideoSort } from "@/lib/validation/video";

const SORT_LABELS: Record<VideoSort, string> = {
  added: "Date added",
  published: "Publish date",
};

/** Newest first by date added or by publish date. */
export function SortSelect({
  value,
  onChange,
}: {
  value: VideoSort;
  onChange: (sort: VideoSort) => void;
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as VideoSort)}>
      <SelectTrigger aria-label="Sort videos" className="shrink-0">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end" position="popper">
        {VIDEO_SORTS.map((sort) => (
          <SelectItem key={sort} value={sort}>
            {SORT_LABELS[sort]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
