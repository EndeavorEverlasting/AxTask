# OPSEC immersive sprint — “verify before you ship”

**Intent:** Make security hygiene feel like **onboarding a crew**, not reading a punishment memo. Good platforms ask you to **verify identity** before they hand you the keys; this sprint mirrors that mindset for **code, secrets, and deploy config**.

## Mission briefing

You are not “checking boxes.” You are **reducing blast radius**: fewer leaked keys, fewer accidental production edits, fewer supply-chain surprises.

| Phase | Crew order | You prove… |
|-------|------------|------------|
| **0 — Gate** | You | You can build and run tests locally (`npm test`). |
| **1 — Identity** | Repo + host | Secrets live in **Render / Neon / OAuth consoles**, not in git. See [`.env.render.example`](../.env.render.example) (committed template — **do not commit** filled `.env.render`; set secrets in Render console or local gitignored copy). |
| **2 — Perimeter** | Git hosting | `main` is **protected**: PRs, reviews, no silent force-push. Optional: `CODEOWNERS` on `render.yaml`, Docker, `server/auth*`. |
| **3 — Patrol** | CI | Tests and **axios guard** run on every PR. Green means the tree is in a known-good state for that revision. |
| **4 — Seal** | Automation | On `main`, when tests pass, CI updates [`TEST_ATTESTATION.md`](./TEST_ATTESTATION.md) — a **public receipt** that this commit was test-clean in GitHub Actions (see workflow). |
| **5 — Audit** | Humans | Before merge: “Would I paste this diff into a public livestream?” If no, fix before push. |

## Why “immersive”?

- **Verification without shame:** Same idea as “confirm you’re human” on high-trust tools — light friction **blocks automated abuse** of *your* pipeline (bots opening PRs with keys, interns pasting `DATABASE_URL` into chat).
- **Receipts beat vibes:** [`TEST_ATTESTATION.md`](./TEST_ATTESTATION.md) is machine-updated; it’s not bragging, it’s **attestation**.
- **Playbooks over paranoia:** [SECURITY_TECHNICAL_REFERENCE.md](./SECURITY_TECHNICAL_REFERENCE.md) lists mitigations; this sprint is **how you operate** day to day. Reporting policy: [SECURITY.md](./SECURITY.md).

## Sprint backlog (pick your velocity)

- [ ] Turn on **branch protection** for `main` (required reviews).
- [ ] Add **`CODEOWNERS`** for deploy-sensitive paths.
- [ ] Ensure **Render** team roles: not everyone is Production admin.
- [ ] Keep **`.env.render`** local only; never commit (gitignored).
- [ ] Run **`npm run security:axios-guard`** before large dependency bumps.
- [ ] Read PR template checklist before every merge.

## Related docs

- [SECURITY.md](./SECURITY.md) — vulnerability reporting (public policy).
- [SECURITY_TECHNICAL_REFERENCE.md](./SECURITY_TECHNICAL_REFERENCE.md) — architecture, env hygiene, repository access (public if repo is public).
- [TEST_ATTESTATION.md](./TEST_ATTESTATION.md) — last CI test receipt (auto).
- [`.env.render.example`](../.env.render.example) — Render variable checklist (no secrets).

---

*Sprint version: 1.0 — April 2026*
