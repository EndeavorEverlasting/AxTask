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
