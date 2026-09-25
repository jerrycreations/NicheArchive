"use client";

import { Geist, Geist_Mono } from "next/font/google";
import { useEffect, useSyncExternalStore } from "react";
import { ErrorState } from "@/components/common/error-state";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/** The theme ThemeProvider saved (next-themes' "theme" key), or the system's. */
function prefersDark(): boolean {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem("theme");
  } catch {
    // Storage can be blocked; fall back to the system setting.
  }
  if (saved === "dark" || saved === "light") return saved === "dark";
  return window.matchMedia(DARK_QUERY).matches;
}

/**
 * The last resort, for an error in the root layout itself. It replaces the
 * whole document, so it brings its own <html>, fonts and styles, and picks
 * the theme itself, since ThemeProvider isn't there to do it.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const dark = useSyncExternalStore(subscribe, prefersDark, () => false);

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased${dark ? " dark" : ""}`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <title>Something went wrong · NicheArchive</title>
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-16 sm:px-6">
          <ErrorState
            title="Something went wrong"
            message="NicheArchive couldn't load. Try again, and if it keeps happening, the server log has the details."
            retry={retry}
            digest={error.digest}
          />
        </main>
      </body>
    </html>
  );
}
