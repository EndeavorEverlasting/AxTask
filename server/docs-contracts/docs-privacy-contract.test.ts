import { describe, expect, it } from "vitest";
import { readRepoFile } from "./test-utils";

describe("community automation privacy doctrine", () => {
  it("keeps security and privacy contract docs aligned on core constraints", () => {
    const securityDoc = readRepoFile("docs/SECURITY.md");
    const privacyContract = readRepoFile("docs/COMMUNITY_AUTOMATION_PRIVACY_CONTRACT.md");

    const requiredSecurityPhrases = [
      "Community Automation and Avatar Privacy Contract",
      "must never expose private task data",
      "fields explicitly marked as public",
      "aggregate or anonymized",
    ];

    const requiredPrivacyContractPhrases = [
      "Data Minimization Rules",
      "Publish only fields explicitly marked as public",
      "Direct exposure of private task notes",
      "aggregate or anonymized",
    ];

    const requiredVoicePersonalizationPhrases = [
      "Voice Personalization Retrieval Security (RAG)",
      "Voice Personalization Privacy Addendum (RAG)",
      "opt-in/opt-out",
      "delete/export",
      "TTL expiration",
      "Retrieval fallback order is user -> cohort/locale -> no personalization.",
    ];

    for (const phrase of requiredSecurityPhrases) {
      expect(securityDoc).toContain(phrase);
    }

    for (const phrase of requiredPrivacyContractPhrases) {
      expect(privacyContract).toContain(phrase);
    }

    for (const phrase of requiredVoicePersonalizationPhrases) {
      const inSecurity = securityDoc.includes(phrase);
      const inPrivacyContract = privacyContract.includes(phrase);
      expect(inSecurity || inPrivacyContract).toBe(true);
    }
  });
});
