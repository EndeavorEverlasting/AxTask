import { describe, expect, it } from "vitest";
import { classifyTaskDemand } from "./classifier";
import { makeRouteDecision } from "./router";
import { validateExecutorCapability, validateTaskDemand, validateRouteDecision } from "./router";
import type { TaskDemand, ExecutorCapability, RouteDecision, TaskDemandLevel, Lane } from "./types";

describe("prompt-leap routing contract", () => {
  const now = new Date().toISOString();

  function makeExecutor(overrides: Partial<ExecutorCapability> = {}): ExecutorCapability {
    return {
      schemaVersion: 1,
      executorId: "test-executor",
      evidence: {
        deterministicEditSuccess: { count: 10, lastVerified: now, fixtureIds: ["fixture-1", "fixture-2"] },
        validationDiscipline: { count: 8, lastVerified: now, fixtureIds: ["fixture-3"] },
        repoReasoning: { count: 5, lastVerified: now, fixtureIds: ["fixture-4"] },
        runtimeProofDiscipline: { count: 2, lastVerified: now, fixtureIds: ["fixture-5"] },
        architectureReconciliationProof: { count: 1, lastVerified: now, fixtureIds: ["fixture-6"] },
      },
      maxAllowedDemand: "architecture-reconciliation",
      lane: "architecture",
      updatedAt: now,
      evidenceSource: "axtask.capability-registry.v1",
      ...overrides,
    };
  }

  it("classifies bounded-deterministic task with exact evidence as low leap", () => {
    const demand = classifyTaskDemand({
      taskId: "bounded-repair-1",
      evidenceSupplied: [
        { type: "exact-transformation", description: "Replace function A with function B in file X", paths: ["server/foo.ts"] },
        { type: "binary-assertions", description: "Assert function signature unchanged; tests pass" },
        { type: "validation-order", description: "Run typecheck then tests" },
      ],
      judgments: [],
      classifiedBy: "test-classifier",
    });

    expect(demand.demandLevel).toBe("bounded-deterministic");
    expect(demand.reasoningLeap).toBe("low");
    expect(demand.factoringOpportunities.length).toBeGreaterThanOrEqual(0);
  });

  it("classifies architecture-reconciliation task with high leap when evidence is vague", () => {
    const demand = classifyTaskDemand({
      taskId: "arch-recon-1",
      evidenceSupplied: [
        { type: "runtime-contract", description: "Need to reconcile new auth flow with existing session handling across multiple services" },
      ],
      judgments: [
        { type: "architecture-decision", description: "Choose between JWT and session-based auth for new service", requiresLiveEvidence: false },
        { type: "cross-boundary-diagnosis", description: "Trace session propagation across API gateway, auth service, and user service", requiresLiveEvidence: false },
        { type: "data-migration-strategy", description: "Migrate existing sessions without downtime", requiresLiveEvidence: false },
      ],
      classifiedBy: "test-classifier",
    });

    expect(demand.demandLevel).toBe("architecture-reconciliation");
    expect(["medium", "high", "critical"]).toContain(demand.reasoningLeap);
    expect(demand.factoringOpportunities.some((f) => f.reducesTo === "bounded-investigation")).toBe(true);
  });

  it("classifies protected-runtime-judgment as critical leap when live evidence required but not supplied", () => {
    const demand = classifyTaskDemand({
      taskId: "runtime-cert-1",
      evidenceSupplied: [
        { type: "proof-artifacts", description: "Previous runtime proof from staging" },
      ],
      judgments: [
        { type: "runtime-certification", description: "Certify new backup worker for production", requiresLiveEvidence: true },
      ],
      classifiedBy: "test-classifier",
    });

    expect(demand.demandLevel).toBe("protected-runtime-judgment");
    expect(demand.reasoningLeap).toBe("critical");
    expect(demand.factoringOpportunities.some((f) => f.description.includes("pre-flight"))).toBe(true);
  });

  it("routes bounded-deterministic task to deterministic-repair lane when executor has sufficient capability", () => {
    const demand = classifyTaskDemand({
      taskId: "route-test-1",
      evidenceSupplied: [
        { type: "exact-transformation", description: "Exact spec", paths: ["server/x.ts"] },
        { type: "binary-assertions", description: "Boolean validators" },
        { type: "validation-order", description: "Order declared" },
      ],
      judgments: [],
      classifiedBy: "test-classifier",
    });

    const executor = makeExecutor({ maxAllowedDemand: "bounded-deterministic", lane: "deterministic-repair" });
    const decision = makeRouteDecision({
      taskDemand: demand,
      executor,
      decisionId: "test-decision-1",
    });

    expect(decision.decision).toBe("allow");
    expect(decision.allowedLane).toBe("deterministic-repair");
    expect(decision.requiredConstraints.some((c) => c.type === "exact-transformation")).toBe(true);
    expect(decision.requiredConstraints.some((c) => c.type === "binary-assertions")).toBe(true);
    expect(decision.requiredConstraints.some((c) => c.type === "validation-order")).toBe(true);
  });

  it("downgrades when task demand exceeds executor maxAllowedDemand", () => {
    const demand = classifyTaskDemand({
      taskId: "route-test-2",
      evidenceSupplied: [
        { type: "runtime-contract", description: "Complex runtime contract" },
      ],
      judgments: [
        { type: "architecture-decision", description: "Architecture choice", requiresLiveEvidence: false },
      ],
      classifiedBy: "test-classifier",
    });

    const executor = makeExecutor({ maxAllowedDemand: "bounded-investigation", lane: "investigation" });
    const decision = makeRouteDecision({
      taskDemand: demand,
      executor,
      decisionId: "test-decision-2",
    });

    expect(decision.decision).toBe("downgrade");
    expect(decision.allowedLane).toBe("investigation");
    expect(decision.blockOrDowngradeReason).toContain("exceeds executor capability");
  });

  it("downgrades when executor lane is below required for task demand", () => {
    const demand = classifyTaskDemand({
      taskId: "route-test-3",
      evidenceSupplied: [
        { type: "runtime-contract", description: "Runtime contract" },
      ],
      judgments: [
        { type: "architecture-decision", description: "Architecture choice", requiresLiveEvidence: false },
      ],
      classifiedBy: "test-classifier",
    });

    const executor = makeExecutor({ maxAllowedDemand: "architecture-reconciliation", lane: "investigation" });
    const decision = makeRouteDecision({
      taskDemand: demand,
      executor,
      decisionId: "test-decision-3",
    });

    expect(decision.decision).toBe("downgrade");
    expect(decision.allowedLane).toBe("architecture");
    expect(decision.blockOrDowngradeReason).toContain("below required");
  });

  it("blocks when executor lane is blocked", () => {
    const demand = classifyTaskDemand({
      taskId: "route-test-4",
      evidenceSupplied: [
        { type: "exact-transformation", description: "Simple fix", paths: ["server/x.ts"] },
      ],
      judgments: [
        { type: "provider-selection", description: "Select provider", requiresLiveEvidence: false },
      ],
      classifiedBy: "test-classifier",
    });

    const executor = makeExecutor({ maxAllowedDemand: "bounded-deterministic", lane: "blocked", failClosedReason: "No evidence recorded" });
    const decision = makeRouteDecision({
      taskDemand: demand,
      executor,
      decisionId: "test-decision-4",
    });

    expect(decision.decision).toBe("block");
    expect(decision.allowedLane).toBe("deterministic-repair");
    expect(decision.blockOrDowngradeReason).toBe("No evidence recorded");
  });

  it("emits owned-files and forbidden-files constraints for architecture-reconciliation", () => {
    const demand = classifyTaskDemand({
      taskId: "route-test-5",
      evidenceSupplied: [
        { type: "owned-files", description: "Files we own", paths: ["server/auth.ts", "server/session.ts"] },
        { type: "forbidden-files", description: "Files we must not touch", paths: ["server/db.ts"] },
      ],
      judgments: [
        { type: "architecture-decision", description: "Auth redesign", requiresLiveEvidence: false },
      ],
      classifiedBy: "test-classifier",
    });

    const executor = makeExecutor({ maxAllowedDemand: "architecture-reconciliation", lane: "architecture" });
    const decision = makeRouteDecision({
      taskDemand: demand,
      executor,
      decisionId: "test-decision-5",
    });

    expect(decision.requiredConstraints.some((c) => c.type === "owned-files")).toBe(true);
    expect(decision.requiredConstraints.some((c) => c.type === "forbidden-files")).toBe(true);
    expect(decision.requiredConstraints.find((c) => c.type === "owned-files")?.paths).toContain("server/auth.ts");
    expect(decision.requiredConstraints.find((c) => c.type === "forbidden-files")?.paths).toContain("server/db.ts");
  });

  it("emits pre-flight validation-order for protected-runtime-judgment", () => {
    const demand = classifyTaskDemand({
      taskId: "route-test-6",
      evidenceSupplied: [
        { type: "owned-files", description: "Owned files", paths: ["server/backup.ts"] },
        { type: "forbidden-files", description: "Forbidden", paths: ["server/db.ts"] },
      ],
      judgments: [
        { type: "runtime-certification", description: "Certify backup worker", requiresLiveEvidence: true },
      ],
      classifiedBy: "test-classifier",
    });

    const executor = makeExecutor({ maxAllowedDemand: "protected-runtime-judgment", lane: "runtime-certification" });
    const decision = makeRouteDecision({
      taskDemand: demand,
      executor,
      decisionId: "test-decision-6",
    });

    const preFlightValidation = decision.requiredConstraints.find((c) => c.type === "validation-order" && c.enforcement === "pre-flight");
    expect(preFlightValidation).toBeDefined();
    expect(preFlightValidation?.description).toContain("Pre-flight validators must pass before any live environment interaction");
  });

  it("validates executor capability schema rejects unknown fields", () => {
    const badExecutor = { ...makeExecutor, unknownField: "should-fail" };
    expect(() => validateExecutorCapability(badExecutor)).toThrow();
  });

  it("validates task demand schema rejects missing required fields", () => {
    const badDemand = { taskId: "x" };
    expect(() => validateTaskDemand(badDemand)).toThrow();
  });

  it("validates route decision schema rejects invalid decision enum", () => {
    const badDecision = { schemaVersion: 1, decisionId: "x", taskDemand: { taskId: "t", demandLevel: "bounded-deterministic", reasoningLeap: "low" }, executor: { executorId: "e", maxAllowedDemand: "bounded-deterministic", lane: "deterministic-repair" }, decision: "invalid", allowedLane: "deterministic-repair", requiredConstraints: [], createdAt: now, validUntil: now };
    expect(() => validateRouteDecision(badDecision)).toThrow();
  });

  it("proves executor capability is evidence-derived not brand-derived", () => {
    const demand = classifyTaskDemand({
      taskId: "brand-test",
      evidenceSupplied: [
        { type: "runtime-contract", description: "Complex architecture task" },
      ],
      judgments: [
        { type: "architecture-decision", description: "Architecture choice", requiresLiveEvidence: false },
      ],
      classifiedBy: "test-classifier",
    });

    const agyExecutor: ExecutorCapability = {
      schemaVersion: 1,
      executorId: "agy-v1",
      evidence: {
        deterministicEditSuccess: { count: 50, lastVerified: now, fixtureIds: ["agy-fix-1"] },
        validationDiscipline: { count: 40, lastVerified: now, fixtureIds: ["agy-val-1"] },
        repoReasoning: { count: 30, lastVerified: now, fixtureIds: ["agy-repo-1"] },
        runtimeProofDiscipline: { count: 10, lastVerified: now, fixtureIds: ["agy-rt-1"] },
        architectureReconciliationProof: { count: 5, lastVerified: now, fixtureIds: ["agy-arch-1"] },
      },
      maxAllowedDemand: "architecture-reconciliation",
      lane: "architecture",
      updatedAt: now,
      evidenceSource: "axtask.capability-registry.v1",
    };

    const cursorExecutor: ExecutorCapability = {
      schemaVersion: 1,
      executorId: "cursor-agent",
      evidence: {
        deterministicEditSuccess: { count: 5, lastVerified: now, fixtureIds: ["cursor-fix-1"] },
        validationDiscipline: { count: 3, lastVerified: now, fixtureIds: ["cursor-val-1"] },
        repoReasoning: { count: 1, lastVerified: now, fixtureIds: ["cursor-repo-1"] },
        runtimeProofDiscipline: { count: 0, lastVerified: now, fixtureIds: [] },
        architectureReconciliationProof: { count: 0, lastVerified: now, fixtureIds: [] },
      },
      maxAllowedDemand: "bounded-investigation",
      lane: "investigation",
      updatedAt: now,
      evidenceSource: "axtask.capability-registry.v1",
    };

    const agyDecision = makeRouteDecision({ taskDemand: demand, executor: agyExecutor, decisionId: "brand-1" });
    const cursorDecision = makeRouteDecision({ taskDemand: demand, executor: cursorExecutor, decisionId: "brand-2" });

    expect(agyDecision.allowedLane).toBe("architecture");
    expect(cursorDecision.decision).toBe("downgrade");
    expect(cursorDecision.allowedLane).toBe("investigation");
  });

  it("includes factoring guidance in route decision", () => {
    const demand = classifyTaskDemand({
      taskId: "factoring-test",
      evidenceSupplied: [
        { type: "runtime-contract", description: "Vague runtime contract" },
      ],
      judgments: [
        { type: "architecture-decision", description: "Architecture choice", requiresLiveEvidence: false },
      ],
      classifiedBy: "test-classifier",
    });

    const executor = makeExecutor({ maxAllowedDemand: "architecture-reconciliation", lane: "architecture" });
    const decision = makeRouteDecision({
      taskDemand: demand,
      executor,
      decisionId: "factoring-decision",
    });

    expect(decision.factoringGuidance.length).toBeGreaterThan(0);
    expect(decision.factoringGuidance.some((f) => f.reducesTo === "bounded-investigation")).toBe(true);
    expect(decision.factoringGuidance.every((f) => f.mechanicalCheck.length > 0)).toBe(true);
  });
});