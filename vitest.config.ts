import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    exclude: ["**/node_modules/**", "**/.next/**"],
    // Dedicated test database — never the dev DB (docs/plan.md §7).
    env: {
      DATABASE_URL: "file:./test.db",
      SESSION_SECRET: "test-secret",
      GEMINI_API_KEY: "test-key",
      GEMINI_TEXT_MODEL: "gemini-3.6-flash",
      GEMINI_IMAGE_MODEL: "gemini-3.1-flash-image",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "server-only": path.resolve(__dirname, "./tests/mocks/server-only-noop.ts"),
    },
  },
});
