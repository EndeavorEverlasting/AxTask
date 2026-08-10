# 2026-08-09 Convergence Ledger and Lua Architecture Vision

## Summary

Added the canonical harness convergence coordination ledger to `.ai/WORK_QUEUE.md`, establishing the serial merge order for PRs #121, #123, and #125, and documenting the Lua architecture vision.

## What changed

- Adds AXQ-006 through AXQ-009 to the shared agent work queue
- Defines the convergence order: retention harness (#121) → stateful execution (#123) → Lua embedding (#125)
- Documents that Lua is a bounded embedded scripting layer controlled by the host
- Clarifies that merging #125 does not authorize Lua dependencies, product files, runtime adapters, JIT, or product behavior migration
- AXQ-009 remains blocked until AXQ-005 (production recovery) and AXQ-008 (harness convergence) are DONE

## Key invariants

- Production recovery (AXQ-001–005) remains separate and is not bypassed
- Architecture target is less unnecessary process/state coupling, not serverless ideology
- Lua remains host-controlled, deny-by-default, harness-only through #125
- First product Lua seam must be selected later through the merged stateful router

## Release evidence

- PR #126: docs(harness): record convergence and Lua vision
- Changed file: `.ai/WORK_QUEUE.md`
