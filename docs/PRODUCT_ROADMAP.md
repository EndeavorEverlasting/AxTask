# Product Roadmap & Truth Map

## Truth Map: Plan Status vs Code Reality (May 2026)

AxTask has evolved from a task app into an ambitious platform chassis with several real feature islands. The overall assessment is that the core app surface is broad, but some "vision glue" is missing or mismatched.

### Strengths & Shipped Reality
- **Core App Surface**: Broadly available routes (planner, calendar, shopping, community, messages, rewards, skill tree, premium, billing, admin, feedback, bundles).
- **Gantt Workspace v2**: Substantially implemented (React Flow, minimap, HUD, legend, detail drawer, critical path, dependency chain, timeline route).
- **Reminders/Location**: Tangible modular routes for `/api/reminders`, location places, and location events.
- **Shopping/NodeWeaver & Conversion Artifacts**: Ahead of plan status. Features include bundle pages, encryption toggles, bundle-link APIs.
- **Feedback/Avatar Nudges**: Implemented. Resolves avatar personas and routes to feedback endpoints.

### Gaps & Work in Progress
- **Billing Mismatch**: Was previously out-of-sync (client calling unimplemented `/api/billing/summary` and `/api/billing/profile`). **(Resolved)**
- **Gamification Convergence**: Foundational but not fully converged. Avatars and skill nodes exist, but advanced mechanics (six-slot entourage, adversary encounters, marketplace) are primarily architectural.
- **Community**: The socially alive/privacy-safe world is uneven. Pockets of posts/replies and age-gating exist, but public profiles and feeds need unification.
- **Conversion Artifacts**: AI re-plan and convert-to-Gantt APIs deliberately return 501; this is unfinished.

## Roadmap Ahead
- Finalize Gantt conversion APIs.
- Converge gamification features into shipped behavior.
- Unify the community and social privacy models.
