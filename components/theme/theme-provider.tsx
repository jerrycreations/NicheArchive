"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/** Light, dark or system theme, stored in localStorage and applied as a class on `<html>`. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      // The no-flash script only needs to run from the server HTML. On the
      // client, a non-JS type stops React warning about rendered <script> tags
      // (see Next's "Preventing flash before hydration" guide).
      scriptProps={{
        type: typeof window === "undefined" ? "text/javascript" : "text/plain",
      }}
    >
      {children}
    </NextThemesProvider>
  );
}
