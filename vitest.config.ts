import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

/**
 * Vitest configuration with an environment split: server tests run in `node`
 * (faster startup, matches production runtime), while client and shared tests
 * run in `jsdom` so React Testing Library works.
 *
 * Phase A of the perf/refactor sweep introduced `projects` so we don't pay
 * jsdom startup cost on every server test.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client", "src"),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "server",
          environment: "node",
          globals: true,
          include: ["server/**/*.test.{ts,tsx}", "tools/**/*.test.{ts,tsx}"],
          exclude: ["node_modules", "dist", "tests/deploy/**"],
        },
      },
      {
        extends: true,
        test: {
          name: "client-shared",
          environment: "jsdom",
          globals: true,
          setupFiles: ["./client/src/test-setup.ts"],
          include: [
            "client/**/*.test.{ts,tsx}",
            "shared/**/*.test.{ts,tsx}",
          ],
          exclude: ["node_modules", "dist", "tests/deploy/**"],
        },
      },
      {
        extends: true,
        test: {
          name: "deploy",
          environment: "node",
          globals: true,
          include: ["tests/deploy/**/*.test.{ts,tsx}"],
          exclude: ["node_modules", "dist"],
        },
      },
    ],
  },
});
