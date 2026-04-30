# Skill Tree HUD Design Contract

Date: 2026-04-30  
Branch: `experimental/unstable-2026-04-30`  
Feature surface: AxTask Skill Tree

## Purpose

The Skill Tree is not a secondary settings page. It is a core progression surface for AxTask. Users must be able to immediately see:

1. where they are in the map,
2. which nodes are locked, available, active, or maxed,
3. which prerequisite path connects one node to the next,
4. how avatar/productivity skills differ from offline/idle generator skills.

This document protects that intent from being overwritten by future cleanup, simplification, or generic UI refactors.

## Non-negotiable UI value

The Skill Tree must remain visually distinct from normal task tables and admin cards.

Required qualities:

- **Immersive HUD shell**: dark command-center canvas, visible map boundary, readable top panel.
- **Glowing edges**: prerequisite connections need energy-line styling, not quiet gray strokes.
- **Animated path affordance**: active and available prerequisite paths should visually imply progression.
- **Readable state hierarchy**: locked, available, active, and maxed nodes must be distinguishable at a glance.
- **Domain separation**: avatar/productivity and offline/idle generator domains need obvious separation.
- **Minimap retained**: the skill tree is spatial. Removing the minimap damages navigation.
- **Reduced-motion respect**: animations must turn off under `prefers-reduced-motion: reduce`.

## Current implementation points

### `client/src/pages/skill-tree.tsx`

Owns page framing and the high-level product language.

Keep the page focused on progression. Do not bury the tree below unrelated widgets.

### `client/src/components/skill-tree/skill-tree-view.tsx`

Owns data loading, wallet state, offline generator prompt, and read-only/compact fallbacks.

The full graph is intentionally rendered only when:

```ts
const showFullGraph = !compact && !readOnly;
```

Do not delete the fallback card/grid view. It remains useful for tutorial, compact, and read-only surfaces.

### `client/src/components/skill-tree/skill-tree-graph.tsx`

Owns the immersive HUD and React Flow rendering.

Protected elements:

- `.skill-tree-flow` canvas shell
- `Skill Tree HUD` status panel
- region panels
- animated edge CSS
- hover elevation on nodes
- minimap and controls
- node state badges

### `client/src/lib/skill-tree-graph-build.ts`

Owns layout and edge construction.

Protected elements:

- `animated` edges for available/unlocked nodes
- `skill-tree-glow-edge` class
- domain-aware edge color
- arrow markers
- increased node dimensions and spacing

## Refactor rules

Before changing this feature, answer these questions in the PR description:

1. Does the skill tree remain immediately discoverable from the Skill Tree page?
2. Can a user visually trace prerequisite paths without reading every card?
3. Are active/available/locked/maxed states still visually distinct?
4. Are avatar and offline generator domains still visually distinct?
5. Is the minimap still available on the full graph?
6. Does reduced-motion still disable path animation?
7. Are compact/read-only fallback views still intact?

If the answer to any question is no, the refactor is not a cleanup. It is a product behavior change.

## Design rationale

The user described the old HUD as insufficient because the Skill Tree existed somewhere in the map but was not practically visible. That is a usability failure, not a decoration issue.

The corrected direction is to make the Skill Tree feel like a live progression map:

- edges glow because prerequisite relationships are the point,
- nodes carry state because progression requires decision-making,
- the HUD summarizes the map because users need orientation,
- the minimap stays because spatial navigation is part of the feature.

In stern terms: do not sand this back into beige enterprise oatmeal.
