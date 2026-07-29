import { z } from "zod";
import {
  TaskDemandSchema,
  TaskDemandLevel,
  ReasoningLeap,
  JudgmentType,
  EvidenceType,
  type TaskDemand,
} from "./types";

const DemandLevelSchema = z.enum([
  "bounded-deterministic",
  "bounded-investigation",
  "architecture-reconciliation",
  "protected-runtime-judgment",
]);

function inferDemandLevelFromJudgment(judgments: Array<{ type: z.infer<typeof JudgmentType>; requiresLiveEvidence: boolean }>): z.infer<typeof DemandLevelSchema> {
  const hasRuntimeCert = judgments.some((j) => j.type === "runtime-certification" || j.requiresLiveEvidence);
  if (hasRuntimeCert) return "protected-runtime-judgment";

  const hasArch = judgments.some(
    (j) =>
      j.type === "architecture-decision" ||
      j.type === "cross-boundary-diagnosis" ||
      j.type === "data-migration-strategy" ||
      j.type === "performance-tradeoff",
  );
  if (hasArch) return "architecture-reconciliation";

  const hasInvestigation = judgments.some(
    (j) => j.type === "provider-selection" || j.type === "security-boundary",
  );
  if (hasInvestigation) return "bounded-investigation";

  return "bounded-deterministic";
}

function inferReasoningLeap(
  evidenceSupplied: Array<{ type: z.infer<typeof EvidenceType>; description: string; paths?: string[] }>,
  judgments: Array<{ type: z.infer<typeof JudgmentType>; requiresLiveEvidence: boolean }>,
): z.infer<typeof ReasoningLeap> {
  const evidenceCount = evidenceSupplied.length;
  const judgmentCount = judgments.length;
  const hasLiveRequirement = judgments.some((j) => j.requiresLiveEvidence);
  const hasVagueEvidence = evidenceSupplied.some(
    (e) =>
      e.type === "runtime-contract" ||
      e.type === "proof-artifacts" ||
      (e.description && e.description.length > 200),
  );
  const hasSpecificEvidence = evidenceSupplied.some(
    (e) =>
      e.type === "exact-transformation" ||
      e.type === "binary-assertions" ||
      e.type === "validation-order" ||
      e.type === "stop-conditions" ||
      (e.paths && e.paths.length > 0),
  );

  if (hasLiveRequirement && evidenceCount < 3) return "critical";
  if (hasLiveRequirement && !hasSpecificEvidence) return "high";
  if (judgmentCount >= 3 && evidenceCount < 2) return "high";
  if (judgmentCount >= 2 && !hasSpecificEvidence) return "medium";
  if (judgmentCount === 1 && evidenceCount === 0) return "medium";
  if (hasVagueEvidence && evidenceCount < judgmentCount) return "medium";
  if (hasSpecificEvidence && judgmentCount <= evidenceCount) return "low";
  if (evidenceCount >= judgmentCount && judgmentCount > 0) return "low";
  if (judgmentCount === 0) return "none";

  return "medium";
}

function findFactoringOpportunities(
  judgments: Array<{ type: z.infer<typeof JudgmentType>; description: string; requiresLiveEvidence: boolean }>,
  evidence: Array<{ type: z.infer<typeof EvidenceType>; description: string }>,
): Array<{ description: string; reducesTo: "bounded-deterministic" | "bounded-investigation"; mechanicalCheck: string }> {
  const opportunities: Array<{ description: string; reducesTo: "bounded-deterministic" | "bounded-investigation"; mechanicalCheck: string }> = [];

  if (judgments.some((j) => j.type === "architecture-decision")) {
    opportunities.push({
      description: "Factor architecture decision into: (1) bounded investigation of alternatives with mechanical comparison matrix, (2) deterministic implementation of chosen path",
      reducesTo: "bounded-investigation",
      mechanicalCheck: "Comparison matrix has explicit scoring rubric; chosen path has exact-file transformation spec",
    });
  }

  if (judgments.some((j) => j.type === "cross-boundary-diagnosis")) {
    opportunities.push({
      description: "Factor cross-boundary diagnosis into: (1) bounded investigation with deterministic log-collection script, (2) exact transformation per finding",
      reducesTo: "bounded-investigation",
      mechanicalCheck: "Log-collection script produces structured JSON; each finding maps to exact-file patch with binary assertion",
    });
  }

  if (judgments.some((j) => j.type === "runtime-certification" && j.requiresLiveEvidence)) {
    opportunities.push({
      description: "Factor runtime certification into: (1) bounded investigation of pre-flight checks, (2) deterministic pre-flight validator, (3) live certification as separate gated lane",
      reducesTo: "bounded-investigation",
      mechanicalCheck: "Pre-flight validator runs without live environment; live cert requires separate executor with runtime-proof evidence",
    });
  }

  if (judgments.some((j) => j.type === "provider-selection")) {
    opportunities.push({
      description: "Factor provider selection into: (1) bounded investigation with capability matrix from evidence registry, (2) deterministic route selection",
      reducesTo: "bounded-deterministic",
      mechanicalCheck: "Capability matrix sourced from evidence registry only; route decision is pure function of task-demand + executor-evidence",
    });
  }

  if (judgments.some((j) => j.type === "data-migration-strategy")) {
    opportunities.push({
      description: "Factor migration strategy into: (1) bounded investigation with dry-run script, (2) deterministic migration with rollback assertions",
      reducesTo: "bounded-deterministic",
      mechanicalCheck: "Dry-run script outputs structured plan; migration has binary assertions for each step; rollback verified by schema diff",
    });
  }

  const hasExactTransformation = evidence.some((e) => e.type === "exact-transformation");
  const hasBinaryAssertions = evidence.some((e) => e.type === "binary-assertions");
  if (!hasExactTransformation || !hasBinaryAssertions) {
    opportunities.push({
      description: "Add exact-file transformation spec and binary assertions to reduce leap from investigation to deterministic repair",
      reducesTo: "bounded-deterministic",
      mechanicalCheck: "Each changed file has before/after spec; each assertion is a boolean predicate evaluated by validator",
    });
  }

  return opportunities;
}

export function classifyTaskDemand(input: {
  taskId: string;
  evidenceSupplied: Array<{ type: z.infer<typeof EvidenceType>; description: string; paths?: string[] }>;
  judgments: Array<{ type: z.infer<typeof JudgmentType>; description: string; requiresLiveEvidence: boolean }>;
  classifiedBy: string;
}): TaskDemand {
  const demandLevel = inferDemandLevelFromJudgment(input.judgments);
  const reasoningLeap = inferReasoningLeap(input.evidenceSupplied, input.judgments);
  const factoringOpportunities = findFactoringOpportunities(input.judgments, input.evidenceSupplied);

  const demand: TaskDemand = {
    schemaVersion: 1,
    taskId: input.taskId,
    demandLevel,
    evidenceSupplied: input.evidenceSupplied,
    judgmentRequired: input.judgments,
    reasoningLeap,
    factoringOpportunities,
    createdAt: new Date().toISOString(),
    classifiedBy: input.classifiedBy,
  };

  return TaskDemandSchema.parse(demand);
}

export { DemandLevelSchema, inferDemandLevelFromJudgment, inferReasoningLeap, findFactoringOpportunities };