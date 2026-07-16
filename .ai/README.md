# AxTask AI harness

This directory is the machine-readable operating layer for repository agents.

## Canonical authority reference

Use:

```text
axtask.agent-authority.v1
```

The ordered source list lives in [`authority.json`](authority.json). Future harness artifacts must reference that identifier instead of copying the authority order into each file.

Required roots:

```text
.ai/skills/
.ai/capabilities/
.ai/triggers/
.ai/workflows/
```

JSON form:

```json
{
  "authorityRef": "axtask.agent-authority.v1"
}
```

YAML or Markdown form:

```yaml
authorityRef: axtask.agent-authority.v1
```

Individual artifacts may define their purpose, inputs, scope, validation, stop conditions, and proof ceiling. They must not redefine the canonical authority order.

## Validation

Run:

```bash
node scripts/ai-harness/validate-authority.mjs
```

The validator checks the manifest, referenced paths, required document anchors, future harness references, and copied authority headings. It is read-only.

## Naming boundary

Agent skills under `.ai/` are repository-agent guidance. They are separate from AxTask product Skill Tree code.
