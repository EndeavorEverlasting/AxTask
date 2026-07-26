import type { z } from "zod";
import { z as zod } from "zod";

export const TaskDemandLevel = zod.enum([
  "bounded-deterministic",
  "bounded-investigation",
  "architecture-reconciliation",
  "protected-runtime-judgment",
]);

export const ReasoningLeap = zod.enum(["none", "low", "medium", "high", "critical"]);

export const EvidenceType = zod.enum([
  "owned-files",
  "forbidden-files",
  "exact-transformation",
  "binary-assertions",
  "validation-order",
  "stop-conditions",
  "runtime-contract",
  "schema",
  "test-fixtures",
  "proof-artifacts",
]);

export const JudgmentType = zod.enum([
  "architecture-decision",
  "runtime-certification",
  "cross-boundary-diagnosis",
  "provider-selection",
  "security-boundary",
  "data-migration-strategy",
  "performance-tradeoff",
]);

export const Lane = zod.enum([
  "deterministic-repair",
  "investigation",
  "architecture",
  "runtime-certification",
  "blocked",
]);

export const Decision = zod.enum(["allow", "downgrade", "block", "escalate"]);

export const ConstraintType = zod.enum([
  "owned-files",
  "forbidden-files",
  "exact-transformation",
  "binary-assertions",
  "validation-order",
  "stop-conditions",
]);

export const EnforcementTiming = zod.enum(["pre-flight", "post-flight", "continuous"]);

export const TaskDemandSchema = zod.object({
  schemaVersion: zod.literal(1),
  taskId: zod.string(),
  demandLevel: TaskDemandLevel,
  evidenceSupplied: zod.array(
    zod.object({
      type: EvidenceType,
      description: zod.string(),
      paths: zod.array(zod.string()).optional(),
    }),
  ),
  judgmentRequired: zod.array(
    zod.object({
      type: JudgmentType,
      description: zod.string(),
      requiresLiveEvidence: zod.boolean(),
    }),
  ),
  reasoningLeap: ReasoningLeap,
  factoringOpportunities: zod.array(
    zod.object({
      description: zod.string(),
      reducesTo: zod.enum(["bounded-deterministic", "bounded-investigation"]),
      mechanicalCheck: zod.string(),
    }),
  ),
  createdAt: zod.string().datetime(),
  classifiedBy: zod.string(),
});

export const ExecutorCapabilitySchema = zod.object({
  schemaVersion: zod.literal(1),
  executorId: zod.string(),
  evidence: zod.object({
    deterministicEditSuccess: zod.object({
      count: zod.number().int().nonnegative(),
      lastVerified: zod.string().datetime(),
      fixtureIds: zod.array(zod.string()),
    }),
    validationDiscipline: zod.object({
      count: zod.number().int().nonnegative(),
      lastVerified: zod.string().datetime(),
      fixtureIds: zod.array(zod.string()),
    }),
    repoReasoning: zod.object({
      count: zod.number().int().nonnegative(),
      lastVerified: zod.string().datetime(),
      fixtureIds: zod.array(zod.string()),
    }),
    runtimeProofDiscipline: zod.object({
      count: zod.number().int().nonnegative(),
      lastVerified: zod.string().datetime(),
      fixtureIds: zod.array(zod.string()),
    }),
    architectureReconciliationProof: zod.object({
      count: zod.number().int().nonnegative(),
      lastVerified: zod.string().datetime(),
      fixtureIds: zod.array(zod.string()),
    }),
  }),
  maxAllowedDemand: TaskDemandLevel,
  lane: Lane,
  failClosedReason: zod.string().optional(),
  updatedAt: zod.string().datetime(),
  evidenceSource: zod.string(),
});

export const RouteDecisionSchema = zod.object({
  schemaVersion: zod.literal(1),
  decisionId: zod.string(),
  taskDemand: zod.object({
    taskId: zod.string(),
    demandLevel: TaskDemandLevel,
    reasoningLeap: ReasoningLeap,
  }),
  executor: zod.object({
    executorId: zod.string(),
    maxAllowedDemand: TaskDemandLevel,
    lane: Lane,
  }),
  decision: Decision,
  allowedLane: zod.enum(["deterministic-repair", "investigation", "architecture", "runtime-certification"]),
  requiredConstraints: zod.array(
    zod.object({
      type: ConstraintType,
      description: zod.string(),
      paths: zod.array(zod.string()).optional(),
      enforcement: EnforcementTiming,
    }),
  ),
  blockOrDowngradeReason: zod.string().optional(),
  factoringGuidance: zod.array(
    zod.object({
      description: zod.string(),
      reducesTo: zod.enum(["bounded-deterministic", "bounded-investigation"]),
      mechanicalCheck: zod.string(),
    }),
  ),
  createdAt: zod.string().datetime(),
  validUntil: zod.string().datetime(),
});

export type TaskDemand = zod.infer<typeof TaskDemandSchema>;
export type ExecutorCapability = zod.infer<typeof ExecutorCapabilitySchema>;
export type RouteDecision = zod.infer<typeof RouteDecisionSchema>;

export type TaskDemandLevel = zod.infer<typeof TaskDemandLevel>;
export type ReasoningLeap = zod.infer<typeof ReasoningLeap>;
export type Lane = zod.infer<typeof Lane>;
export type Decision = zod.infer<typeof Decision>;
export type ConstraintType = zod.infer<typeof ConstraintType>;
export type EnforcementTiming = zod.infer<typeof EnforcementTiming>;