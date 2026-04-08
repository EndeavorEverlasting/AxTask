import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

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
    setupFiles: ["./client/src/test-setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules"],
  },
});

