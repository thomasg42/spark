import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Forward slashes keep the aliases working on Windows as well as in CI.
const dir = (rel: string) => fileURLToPath(new URL(rel, import.meta.url)).split("\\").join("/");

export default defineConfig({
  resolve: {
    alias: {
      "@/": dir("./src/"),
      "@shared/": dir("./supabase/functions/_shared/"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
