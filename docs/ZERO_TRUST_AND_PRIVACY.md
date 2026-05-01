# Zero Trust & Privacy Model

## Principles

The foundational promise is that AxTask's "alive, social, multi-avatar world" must be extremely safe, private, and auditable.

1. **E2E Encryption Support (where applicable)**
   - Certain fields or task payloads may opt-in to encryption or obfuscation where standard data is otherwise visible to the platform.
2. **Multi-Factor Authentication (MFA)**
   - Critical workflows (e.g. Community avatar interactions, billing updates, profile deletion) demand MFA or re-verification.
3. **Data Sharing & Community**
   - The user must explicitly opt-in to public or community sharing. Community profiles abstract away the actual user identity behind randomized avatars or pseudo-anonymous aliases.
4. **Age Gating**
   - Forum logic and specific feature islands require robust age-gating, preventing COPPA violations or uncontrolled sharing for minors.

## Privacy Checklists
- Never attach full `res.json` bodies to access logs.
- Sanitize endpoints with DTO mappers (`toPublicSessionUser`, `toPublicWallet`, etc.).
- The `security_events` table contains granular audit logs (including `archetype_signal` rollups), but no raw user payloads.
