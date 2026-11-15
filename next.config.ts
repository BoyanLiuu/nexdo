import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

/** `pnpm analyze` opens the treemap; the budget itself is checked in README.md. */
export default bundleAnalyzer({ enabled: process.env.ANALYZE === "true" })(nextConfig);
