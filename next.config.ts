import type { NextConfig } from "next";

// GitHub Pages serves this app as static files from https://<user>.github.io/<repo>/.
// BASE_PATH is "/<repo>" in CI and empty for local development.
const basePath = (process.env.BASE_PATH ?? "").replace(/\/$/, "");

const config: NextConfig = {
  output: "export",
  basePath: basePath || undefined,
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  poweredByHeader: false,
  env: {
    // The anon key is public by design: Row Level Security is what protects data.
    // The service role key, Anthropic key and encryption key are NEVER exposed here.
    NEXT_PUBLIC_SUPABASE_URL: process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default config;
