# Security policy

**AxTask** — public source is hosted on GitHub. This page is the **policy** file we want researchers and users to read first. It stays **high level** on purpose.

## Reporting a vulnerability

- **Preferred:** Use [GitHub Security Advisories / private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities-with-github-advanced-security) for this repository if the maintainer has enabled it for the repo.
- **Alternative:** Open a **private** discussion with maintainers (e.g. via GitHub profile contact or an email published on the org/site) with subject line `AxTask security disclosure`. Do **not** post exploit details in public issues before a fix or agreed disclosure timeline.

Please include:

- Affected component (e.g. `server/`, `client/`, auth, uploads)
- Steps to reproduce (minimal PoC)
- Impact assessment (confidentiality / integrity / availability)
- Whether you want attribution

We aim to acknowledge receipt within **several business days** and to agree on a remediation timeline when valid. Timelines depend on severity and maintainer capacity.

## Supported versions

Security fixes are applied to the **default development branch** (`main` or equivalent) and released through the normal deploy pipeline. There is **no long-term LTS** promise unless explicitly documented elsewhere. Use the latest tagged release or `main` for deployments you care about.

## Safe disclosure

- Please allow reasonable time for a patch before public technical detail.
- Do not access, modify, or exfiltrate user data that is not your own as part of research.

## What this file deliberately omits

Operational detail (exact rate limits, header matrices, internal validation flows, deployment checklists) is **not** required for reporting issues and can aid unnecessary reconnaissance when pasted into a **public** repo.

Contributors who need that material may use **[`SECURITY_TECHNICAL_REFERENCE.md`](./SECURITY_TECHNICAL_REFERENCE.md)** — with the understanding that **in a public repository that file is also public**. For a stricter posture, maintainers should keep deep architecture notes **outside** the public default branch (private docs, internal wiki, or gitignored local runbooks).

## Related docs (product & engineering)

- [`OTP_DELIVERY.md`](./OTP_DELIVERY.md) — how MFA/OTP is delivered (no secrets).
- [`MFA_SIGNUP_VERIFICATION.md`](./MFA_SIGNUP_VERIFICATION.md) — planned sign-up verification (high level).

---

**Last updated:** April 2026  
