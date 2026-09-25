"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { SearchInput } from "@/components/library/search-input";
import { SortSelect } from "@/components/library/sort-select";
import { libraryPath } from "@/lib/navigation";
import type { VideoSort } from "@/lib/validation/video";

/** Searching waits this long after the last keystroke. */
const SEARCH_DELAY_MS = 300;

/**
 * The library's search box and sort control. Both live in the URL (`?q=` and
 * `?sort=`), which the page reads. Typing updates the URL once it pauses, and
 * replaces the history entry, so Back leaves the library instead of stepping
 * through keystrokes.
 */
export function LibraryControls({
  q,
  sort,
  className,
}: {
  /** The search and sort the page was rendered with. */
  q: string;
  sort: VideoSort;
  className?: string;
}) {
  const router = useRouter();
  const [text, setText] = useState(q);
  const [sortValue, setSortValue] = useState(sort);
  const [focused, setFocused] = useState(false);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // When the URL changes, show what it says. While the box has focus, the
  // URL is catching up with the typing, so the typed text stays; a change
  // from elsewhere, such as the Library link, comes while it's unfocused.
  const [rendered, setRendered] = useState({ q, sort });
  if (rendered.q !== q || rendered.sort !== sort) {
    setRendered({ q, sort });
    if (!focused) setText(q);
    setSortValue(sort);
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  function navigate(next: { q: string; sort: VideoSort }) {
    clearTimeout(timer.current);
    startTransition(() => router.replace(libraryPath(next), { scroll: false }));
  }

  function changeText(value: string) {
    setText(value);
    clearTimeout(timer.current);
    // Clearing the box shows everything again at once.
    if (!value.trim()) {
      if (q) navigate({ q: "", sort: sortValue });
      return;
    }
    timer.current = setTimeout(() => navigate({ q: value, sort: sortValue }), SEARCH_DELAY_MS);
  }

  return (
    <div className={className}>
      <SearchInput
        value={text}
        onChange={changeText}
        onSubmit={() => navigate({ q: text, sort: sortValue })}
        onFocusChange={setFocused}
        pending={pending}
        className="min-w-0 flex-1 sm:max-w-sm lg:w-72 lg:flex-none"
      />
      <SortSelect
        value={sortValue}
        onChange={(next) => {
          setSortValue(next);
          navigate({ q: text, sort: next });
        }}
      />
    </div>
  );
}
