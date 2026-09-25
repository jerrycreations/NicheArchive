"use client";

import { createContext, use } from "react";

const DeletedVideosContext = createContext<ReadonlySet<string>>(new Set());

/**
 * The videos that a chat's library answers cite but that have been deleted
 * since. Their source cards show as deleted, and citations of them stay text.
 */
export function DeletedVideosProvider({
  youtubeIds,
  children,
}: {
  youtubeIds: readonly string[];
  children: React.ReactNode;
}) {
  return <DeletedVideosContext value={new Set(youtubeIds)}>{children}</DeletedVideosContext>;
}

/** Deleted videos cited in this chat, by YouTube ID. Empty outside a saved chat's page. */
export function useDeletedVideos(): ReadonlySet<string> {
  return use(DeletedVideosContext);
}
