// Public schema surface for AxTask. Back-compat barrel for the Phase F-1
// per-domain split under `shared/schema/`. Keep this file as a one-line
// re-export — every caller across client/server/tests imports from
// `@shared/schema`, and the deploy pipeline (drizzle-kit + apply-migrations)
// also points here. Adding declarations here would reintroduce the monolith
// the split was designed to retire.
//
// New tables: add them to the matching file under `shared/schema/*.ts` and
// let `shared/schema/index.ts`'s `export *` re-exports propagate the symbol.
//
// See docs/MODULE_LAYOUT.md (Phase F) for the domain boundaries.
export * from "./schema/index";
