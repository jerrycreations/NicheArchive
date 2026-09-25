"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/common/error-state";

/**
 * Anything an app page throws while rendering. The top bar stays, since this
 * boundary sits inside the layout. Pages show an unreachable database
 * themselves, because in production Next replaces a server error's message
 * with a generic one before it gets here.
 */
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorState
      title="Something went wrong"
      message="This page couldn't load. Try again, and if it keeps happening, the server log has the details."
      retry={retry}
      digest={error.digest}
    />
  );
}
