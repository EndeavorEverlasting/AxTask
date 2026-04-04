import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

const legacy = process.env.VITEST_LEGACY === "1";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client", "src"),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: [path.resolve(__dirname, "client", "src", "test-setup.ts")],
    include: legacy ? ["**/*.legacy.test.{ts,tsx}"] : ["**/*.test.{ts,tsx}"],
    exclude: legacy ? ["node_modules"] : ["**/*.legacy.test.{ts,tsx}", "node_modules"],
  },
});

