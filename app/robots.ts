import type { MetadataRoute } from "next";

// An unlisted archive: every crawler is asked to stay out, and the root
// layout also marks pages noindex.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
