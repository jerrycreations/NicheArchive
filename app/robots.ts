import type { MetadataRoute } from "next";

// A private archive: every crawler is asked to stay out. The proxy skips
// robots.txt so crawlers can read it, and the root layout marks pages noindex.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
