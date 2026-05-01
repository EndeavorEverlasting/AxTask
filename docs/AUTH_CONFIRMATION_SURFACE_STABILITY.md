# Auth and confirmation surface stability

**Sprint context (2026-05-01):** Ships on branch `feature/2026-05-01-auth-surface-stability` as a **separate sprint** from PR42 session-security / registration hardening on `main`. This note keeps auth/MFA loading surfaces aligned with the calm-mode flashing fix so agents do not regress first-paint flicker when editing login or confirmation flows.

Companion to **[SCROLL_REFRESH_VISUAL_STABILITY.md](./SCROLL_REFRESH_VISUAL_STABILITY.md)** (canonical scroll, Gantt, and compositor playbook). This note focuses on **public auth routes**, **session loading**, and **branded fallbacks**.

---

## Protected URL checklist (smoke + Playwright)

Use these shapes when verifying branding and stability (see `tests/ui/auth-confirmation-surfaces.spec.ts`):

- `/login`
- `/login?mode=register`
- `/login?reset_token=…` (token is swallowed; UI shows reset step)
- `/login?step=totp` (pending TOTP or graceful fallback)
- `/login?error=auth_failed` (OAuth-style error; URL cleaned to `/login`)
- `/mfa/confirm` and permutations with partial query params (invalid-link card)
- `/mfa/confirm?challengeId=…&code=…&purpose=…` (happy path)
- `/welcome-confirm`

Routing: [`client/src/App.tsx`](../client/src/App.tsx) short-circuits `/mfa/confirm` and `/welcome-confirm` to `ExperienceConfirmPage` before the authenticated shell. Unauthenticated `/login` renders outside the lazy `Router` `Suspense` boundary.

---

## Flashing / flicker symptom matrix (auth-relevant rows)

| Symptom | Typical cause | Established fix |
|--------|----------------|------------------|
| **Blank white flash** during route or **auth loading** | Unbranded `Suspense` fallback, plain `bg-background` spinner, or eager/lazy boundary mismatch | **Branded `RouteFallback`** in `App.tsx` (gradient + pulse; framer-motion-free). Auth **`loading`** branch uses the same fallback. |
| **Hue pulse** when scroll starts or settles | `body[data-axtask-calm]` toggling without hysteresis / smooth glass transitions | **`CALM_RELEASE_HYSTERESIS_MS`**, explicit `transition-property` on glass in `index.css`. See SCROLL doc. |
| **Glass cards “blanking”** mid-scroll | Backdrop blur + compositor under scroll | Calm rules, reader mask, **`notifyScrollBudget()`** from main + sidebar scroll roots. |
| **Pretext chips bleeding through** panels | Calm strips blur; glass too translucent | **Reader mask** + **`.axtask-calm-blur-fallback`** on bare `backdrop-blur` surfaces (login card, `PretextGlassCard`, marketing shells). |
| **Sidebar / nav flicker** over Pretext | Glossy glass on full-height nav | **`.axtask-nav-chrome`** (opaque), not **`glass-panel-glossy`** for nav chrome. |
| **Gantt / timeline text stretching** | Bad SVG scaling | TaskGantt + SCROLL doc — same calm/Gantt family. |

---

## Calm-mode primitives (do not remove or “simplify away”)

Preserve these when editing auth-adjacent UI:

- **`notifyScrollBudget()`** — wired from main shell and sidebar inner scroll containers.
- **`body[data-axtask-calm]`** — set by `animation-budget.ts` during scroll/longtask pauses.
- **`CALM_RELEASE_HYSTERESIS_MS`** (90 ms) — reduces edge-flash on calm exit.
- **`.axtask-calm-blur-fallback`** — opt-in for non–`.glass-panel` blur utilities so calm gets reader-fill.
- **`.axtask-nav-chrome`** — opaque nav; avoids hue swap over Pretext.
- **`.axtask-stable-panel`** — planner / heavy cards; see `index.css`.

### Forbidden “fixes”

Do **not** remove Pretext, disable animations globally, or flatten the entire UI to “stop flicker.” Do **not** replace branded `RouteFallback` with a plain page-background spinner. Do **not** use **`glass-panel-glossy`** for full-height nav chrome. Do **not** delete **`notifyScrollBudget`** from inner scroll roots. Do **not** use **`transition-all`** on large scrolling surfaces.

---

## Shells and fallbacks

- **`RouteFallback`** — Lazy route loading + session `loading`; must stay branded and motion-light (`docs/PERF_PERFORMANCE_BUDGETS.md`).
- **`PretextShell`** — Single-mount aurora + orbs + optional chips for authenticated app; see `pretext-shell.tsx`.
- **`PretextConfirmationShell`** / **`PretextGlassCard`** — Full-bleed MFA and welcome confirmation; glass uses **`axtask-calm-blur-fallback`** on the card base.

---

## Transactional email honesty

- **OTP / MFA email:** Branded templates in `server/services/email-templates.ts` (`buildOtpEmail`); sent via `otp-delivery.ts` in production (Resend).
- **Password reset:** `buildPasswordResetEmail` exists; **`POST /api/auth/forgot-password`** still does not send mail in all environments (dev logs URL). Do **not** claim “all transactional auth emails are beautified and wired” until the forgot-password route dispatches the template through the same transport as OTP.

---

## Verification

- `npm run check`
- `npm test`
- `npm run build`
- `npm run test:ui:auth-surfaces` (CI boots `start:app` with `REGISTRATION_MODE=open`; restart any stale server on port 5000 if local flakes.)
- `npx vitest run client/src/index.calm-mode.contract.test.ts client/src/lib/animation-budget.test.ts client/src/components/task-gantt.test.ts`

Manual: exercise protected URLs above plus `/planner` and `/rewards` in **dark** theme.

---

## Related docs

- [SCROLL_REFRESH_VISUAL_STABILITY.md](./SCROLL_REFRESH_VISUAL_STABILITY.md) — full incident class, architecture, Gantt.
- [DEBUGGING_REFERENCE.md](./DEBUGGING_REFERENCE.md) — calm-mode debugging entry.
- [PERF_PERFORMANCE_BUDGETS.md](./PERF_PERFORMANCE_BUDGETS.md) — animation budget + RouteFallback / first-paint notes.
