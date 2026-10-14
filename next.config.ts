import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native / browser-automation packages must stay out of the server bundle.
  serverExternalPackages: ["better-sqlite3", "playwright", "playwright-core", "@axe-core/playwright", "lighthouse", "chrome-launcher"],
};

export default nextConfig;
