"use client";

import { LoaderCircleIcon, SearchIcon, XIcon } from "lucide-react";
import { useRef } from "react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";

/**
 * The library's search box. LibraryControls owns its text and decides when
 * the search runs; this only shows it. Escape and the × button clear it, and
 * Enter searches at once.
 */
export function SearchInput({
  value,
  onChange,
  onSubmit,
  onFocusChange,
  pending,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onFocusChange: (focused: boolean) => void;
  /** A search is loading. */
  pending: boolean;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <form
      role="search"
      className={className}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <InputGroup>
        <InputGroupAddon>
          {pending ? (
            <LoaderCircleIcon className="animate-spin" aria-hidden />
          ) : (
            <SearchIcon aria-hidden />
          )}
        </InputGroupAddon>
        <InputGroupInput
          ref={inputRef}
          type="search"
          enterKeyHint="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && value) {
              event.preventDefault();
              onChange("");
            }
          }}
          onFocus={() => onFocusChange(true)}
          onBlur={() => onFocusChange(false)}
          placeholder="Search titles, channels, transcripts"
          aria-label="Search videos"
          // The browser's own clear button would duplicate the one below.
          className="[&::-webkit-search-cancel-button]:hidden"
        />
        {value && (
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              size="icon-xs"
              aria-label="Clear search"
              onClick={() => {
                onChange("");
                inputRef.current?.focus();
              }}
            >
              <XIcon />
            </InputGroupButton>
          </InputGroupAddon>
        )}
      </InputGroup>
    </form>
  );
}
