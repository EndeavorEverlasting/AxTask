# External calendar sync (planned)

**Goal:** Sync AxTask tasks / events with **Google Calendar** and **Microsoft (Outlook/Windows) Calendar**, including event properties where applicable, and reinforce **notifications**.

## Approach (draft)

- **Google:** `googleapis` is already a dependency; OAuth, incremental sync, optional push notifications.
- **Microsoft:** Microsoft Graph for Outlook calendar (new integration).
- **Implementation:** Prefer a dedicated **sync engine** (see [ENGINES.md](./ENGINES.md)) with explicit conflict policy and retries.

This document will be expanded when the feature is implemented. Track status in [PRODUCT_ROADMAP.md](./PRODUCT_ROADMAP.md).
