import { describe, expect, it } from "vitest";
import path from "node:path";
import { readRepoFile, repoFileExists } from "./test-utils";

describe("documentation doctrine contracts", () => {
  const canonicalDocs = [
    "docs/REPORT_ENGINE_AGENT_CONTRACTS.md",
    "docs/CLARIFICATION_PROTOCOL.md",
    "docs/RAG_CLASSIFICATION_BLUEPRINT.md",
    "docs/ORB_AVATAR_EXPERIENCE_CONTRACT.md",
    "docs/COMMUNITY_AUTOMATION_PRIVACY_CONTRACT.md",
  ];

  it("ships canonical doctrine contract documents", () => {
    for (const docPath of canonicalDocs) {
      expect(repoFileExists(docPath)).toBe(true);
    }
  });

  it("documents docs/README as canonical philosophy source", () => {
    const docsReadme = readRepoFile("docs/README.md");
    expect(docsReadme).toContain("## Axiomatic Completion Philosophy (Canonical)");
    expect(docsReadme).toContain("### Canonical Doctrine Contracts");
    expect(docsReadme).toContain("COMMUNITY_AUTOMATION_PRIVACY_CONTRACT.md");
    expect(docsReadme).toContain("### Voice Personalization Doctrine (RAG)");
  });

  it("defines voice personalization retrieval contracts in architecture docs", () => {
    const ragBlueprint = readRepoFile("docs/RAG_CLASSIFICATION_BLUEPRINT.md");
    const securityDoc = readRepoFile("docs/SECURITY.md");
    const privacyContract = readRepoFile("docs/COMMUNITY_AUTOMATION_PRIVACY_CONTRACT.md");
    const architectureDoc = readRepoFile("docs/ARCHITECTURE.md");

    expect(ragBlueprint).toContain("## Voice Memory Data Contract (Correction Events)");
    expect(ragBlueprint).toContain("## Inference Integration Interfaces");
    expect(ragBlueprint).toContain("## Evaluation and Rollout Guardrails");
    expect(securityDoc).toContain("### Voice Personalization Retrieval Security (RAG)");
    expect(privacyContract).toContain("## Voice Personalization Privacy Addendum (RAG)");
    expect(architectureDoc).toContain("## Voice Personalization Architecture (RAG)");
    expect(architectureDoc).toContain("user -> cohort -> baseline");
  });

  it("links doctrine contracts from root README documentation list", () => {
    const rootReadme = readRepoFile("README.md");
    expect(rootReadme).toContain("docs/REPORT_ENGINE_AGENT_CONTRACTS.md");
    expect(rootReadme).toContain("docs/CLARIFICATION_PROTOCOL.md");
    expect(rootReadme).toContain("docs/RAG_CLASSIFICATION_BLUEPRINT.md");
    expect(rootReadme).toContain("docs/ORB_AVATAR_EXPERIENCE_CONTRACT.md");
    expect(rootReadme).toContain("docs/COMMUNITY_AUTOMATION_PRIVACY_CONTRACT.md");
  });

  it("tracks doctrine contracts in active/legacy authority index", () => {
    const activeIndex = readRepoFile("docs/ACTIVE_LEGACY_INDEX.md");
    for (const docPath of canonicalDocs) {
      expect(activeIndex).toContain(path.basename(docPath));
    }
  });
});

describe("agent operating authority contracts", () => {
  const agents = readRepoFile("AGENTS.md");
  const guardrails = readRepoFile("AGENT_GUARDRAILS.md");
  const deploymentDoc = readRepoFile("docs/GIT_BRANCHING_AND_DEPLOYMENT.md");
  const replitNotes = readRepoFile("replit.md");

  it("makes current repository contracts authoritative over historical platform notes", () => {
    expect(agents).toContain("## Canonical operating authority");
    expect(agents).toContain("[AGENT_GUARDRAILS.md](AGENT_GUARDRAILS.md)");
    expect(agents).toContain("`replit.md` is an architecture snapshot, not deployment authority");
    expect(guardrails).toContain("## 1. Authority order");
    expect(guardrails).toContain("Current repository state and executable contracts");
    expect(guardrails).toContain("may contain historical platform context");
    expect(replitNotes).toContain("This file is a historical architecture and feature snapshot");
    expect(replitNotes).toContain("It is not deployment authority");
  });

  it("records Render and Neon as the current deployment and recovery posture", () => {
    expect(guardrails).toContain("The current production path targets Render");
    expect(guardrails).toContain("current production recovery and cost controls target Neon");
    expect(replitNotes).toContain("Current deployment work targets Render");
    expect(replitNotes).toContain("current production database recovery and cost controls target Neon");
    expect(deploymentDoc).toContain("AxTask / Render specifics");
    expect(deploymentDoc).toContain("`autoDeploy: true`");
  });

  it("preserves liveness, readiness, and deterministic schema boundaries", () => {
    expect(guardrails).toContain("`/health` is DB-free process liveness");
    expect(guardrails).toContain("`/ready` is explicit database readiness");
    expect(guardrails).toContain("Production startup must not run live `drizzle-kit push` by default");
    expect(guardrails).toContain("Use `scripts/apply-migrations.mjs`");
    expect(guardrails).toContain("Do not restore runtime schema discovery");
  });

  it("rejects the stale blanket Replit production doctrine", () => {
    expect(guardrails).not.toContain("The application is deployed on **Replit Autoscale**");
    expect(guardrails).not.toContain("Replit Helium) is the **live production database**");
    expect(guardrails).not.toContain("Forbidden Files — NEVER EDIT");
    expect(guardrails).not.toContain("scripts are tuned for Replit Autoscale");
    expect(replitNotes).not.toContain("**PostgreSQL**: Replit Helium database");
  });

  it("treats high-risk configuration as scoped and testable rather than permanently forbidden", () => {
    expect(guardrails).toContain("## 7. High-risk surfaces");
    expect(guardrails).toContain("These files are not permanently forbidden");
    expect(guardrails).toContain("explicit ownership, repository evidence, targeted tests, and rollback notes");
  });
});
