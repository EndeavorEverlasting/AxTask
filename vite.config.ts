import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

// Lazily import the visualizer only when ANALYZE=1 so it never affects prod builds by default.
const analyzePlugins: any[] = [];
if (process.env.ANALYZE === "1") {
  try {
    const { visualizer } = await import("rollup-plugin-visualizer");
    analyzePlugins.push(
      visualizer({
        filename: path.resolve(import.meta.dirname, "dist/public/stats.html"),
        template: "treemap",
        gzipSize: true,
        brotliSize: true,
      }) as any,
    );
  } catch {
    // visualizer optional; silently skip if not installed
  }
}

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...analyzePlugins,
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    // Tune the main-chunk warning ceiling so our own budget script in
    // tools/perf/bundle-budget.mjs is the source of truth (it caps at 3.5 MB).
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // Vendor code-splitting: pull heavy dependencies into their own
        // predictable chunks so page-level code doesn't swell and so
        // browsers cache stable vendor bundles across releases.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;

          if (id.includes("react-dom")) return "react-vendor";
          if (/[\\/]node_modules[\\/]react[\\/]/.test(id)) return "react-vendor";
          if (id.includes("wouter")) return "react-vendor";
          if (id.includes("scheduler")) return "react-vendor";

          if (id.includes("@radix-ui")) return "radix";
          if (id.includes("@tanstack")) return "tanstack";
          if (id.includes("recharts") || id.includes("d3-")) return "recharts";
          if (id.includes("framer-motion")) return "framer-motion";
          if (id.includes("xlsx") || id.includes("papaparse")) return "spreadsheet";
          if (id.includes("lucide-react") || id.includes("react-icons")) return "icons";
          if (id.includes("date-fns")) return "date";
          if (id.includes("@dnd-kit")) return "dnd";
          if (id.includes("embla-carousel")) return "embla";
          if (id.includes("zod") || id.includes("@hookform")) return "forms";

          return undefined;
        },
      },
    },
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
