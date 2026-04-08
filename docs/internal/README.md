# Internal operator documentation (this folder)

Use this folder for **procedures that should not ship with a public clone** in a filled-in form (real operator emails, hostnames, or one-off SQL).

## What is committed vs local-only

| File | In git? | Purpose |
|------|---------|---------|
| **`README.md`** | Yes | This note |
| **`OPERATOR_RUNBOOK.template.md`** | Yes | Full operator + local-testing procedures with `YOUR_*` placeholders (safe to commit even on public repos) |
| **`OPERATOR_RUNBOOK.md`** | **No** (gitignored) | Your copy after replacing placeholders — optional; or mirror the template into a **private wiki** instead |

## Quick start

1. Read **`OPERATOR_RUNBOOK.template.md`** end-to-end.
2. Either:
   - **A)** Copy it to **`OPERATOR_RUNBOOK.md`** in this directory (same folder), edit placeholders, and keep that file local; or  
   - **B)** Paste the sections into your org’s **private wiki** and maintain them there.

**Create your local copy (PowerShell, from repo root):**

```powershell
Copy-Item docs\internal\OPERATOR_RUNBOOK.template.md docs\internal\OPERATOR_RUNBOOK.md
```

**macOS / Linux / Git Bash:**

```bash
cp docs/internal/OPERATOR_RUNBOOK.template.md docs/internal/OPERATOR_RUNBOOK.md
```

End-user login (no operator SQL) remains in **[`../SIGN_IN.md`](../SIGN_IN.md)**.
