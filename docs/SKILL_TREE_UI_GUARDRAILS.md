# Skill Tree UI Guardrails

Date: 2026-04-30
Branch: `experimental/unstable-2026-04-30`

## Purpose

The skill tree is a core progression surface. It should be easy to find, visually distinct, and large enough to read as a map rather than a cramped card list.

## Guardrails

1. The skill tree must stay reachable from the primary HUD, especially on mobile.
2. The full-page graph should remain larger than a normal content card.
3. Nodes must show clear states: Available, Active, Locked, and Maxed.
4. Edges must visibly connect prerequisite nodes to child nodes.
5. Avatar/productivity paths and idle-generator paths should be visually distinguishable.
6. Energized paths may glow or animate, but reduced-motion users must receive a clear static version.
7. Graph-specific styling should stay near the skill-tree module, preferably in `client/src/components/skill-tree/skill-tree.css`.

## Files involved

- `client/src/pages/skill-tree.tsx`: full-page presentation.
- `client/src/components/skill-tree/skill-tree-view.tsx`: data loading and compact/full graph switching.
- `client/src/components/skill-tree/skill-tree-graph.tsx`: React Flow canvas and node rendering.
- `client/src/lib/skill-tree-graph-build.ts`: layout and edge state classes.
- `client/src/App.tsx`: mobile HUD route exposure.

## Review checklist

Before merging future UI changes, confirm:

- `/skill-tree` is reachable from the mobile bottom navigation.
- The graph canvas has strong visual hierarchy.
- Glowing or highlighted edges still connect related nodes.
- Locked paths are quieter but still traceable.
- The design still feels like a progression map, not a hidden settings panel.
