// Barrel module for the per-domain schema split (Phase F-1).
//
// Back-compat: `shared/schema.ts` re-exports this file verbatim, so every
// existing `import { ... } from "@shared/schema"` call site continues to
// resolve unchanged. Never add anything to this file other than re-exports;
// if a new table/schema is added, put it in the right per-domain file and
// let `export *` pick it up.
//
// Import order matches the dependency DAG (core → tasks → ops, plus
// gamification which depends only on core). Reordering can mask module
// cycles — don't do it without checking the FK graph.

export * from "./core";
export * from "./tasks";
export * from "./gamification";
export * from "./ops";
