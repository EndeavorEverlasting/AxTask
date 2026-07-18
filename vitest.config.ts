import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

/**
 * Vitest configuration with an environment split: server and operational
 * harness tests run in `node`, while client and shared tests run in `jsdom`.
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
          include: [
            "server/**/*.test.{ts,tsx}",
            "tools/**/*.test.{ts,tsx}",
            "tests/ops/**/*.test.{ts,tsx}",
          ],
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
            "tests/contracts/**/*.test.{ts,tsx}",
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
