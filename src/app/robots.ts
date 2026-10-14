import type { MetadataRoute } from "next";

// Reports are about other people's websites: keep them (and the API) out of search results.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/scans/"] } };
}
