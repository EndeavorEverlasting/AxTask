import { z } from "zod";
import {
  TaskDemandSchema,
  ExecutorCapabilitySchema,
  RouteDecisionSchema,
  TaskDemandLevel,
  Lane,
  Decision,
  type TaskDemand,
  type ExecutorCapability,
  type RouteDecision,
} from "./types";

const DEMAND_ORDER: TaskDemandLevel[] = [
  "bounded-deterministic",
  "bounded-investigation",
  "architecture-reconciliation",
  "protected-runtime-judgment",
];

const LANE_ORDER: Lane[] = [
  "deterministic-repair",
  "investigation",
  "architecture",
  "runtime-certification",
];

function demandToIndex(demand: TaskDemandLevel): number {
  return DEMAND_ORDER.indexOf(demand);
}

function laneToIndex(lane: Lane): number {
  return LANE_ORDER.indexOf(lane);
}

function demandMeetsCapability(taskDemand: TaskDemandLevel, executorMaxDemand: TaskDemandLevel): boolean {
  return demandToIndex(taskDemand) <= demandToIndex(executorMaxDemand);
}

function laneMeetsDemand(lane: Lane, demand: TaskDemandLevel): boolean {
  const laneIdx = laneToIndex(lane);
  const demandIdx = demandToIndex(demand);
  return laneIdx >= demandIdx;
}

function computeRequiredConstraints(taskDemand: TaskDemand): Array<{
  type: "owned-files" | "forbidden-files" | "exact-transformation" | "binary-assertions" | "validation-order" | "stop-conditions";
  description: string;
  paths?: string[];
  enforcement: "pre-flight" | "post-flight" | "continuous";
}> {
  const constraints: RouteDecision["requiredConstraints"] = [];

  if (taskDemand.demandLevel === "bounded-deterministic" || taskDemand.demandLevel === "bounded-investigation") {
    constraints.push({
      type: "exact-transformation",
      description: "Every changed file must have a before/after specification",
      enforcement: "pre-flight",
    });
    constraints.push({
      type: "binary-assertions",
      description: "Each transformation must have boolean predicate validators",
      enforcement: "post-flight",
    });
    constraints.push({
      type: "validation-order",
      description: "Validators must run in declared order; stop on first failure",
      enforcement: "continuous",
    });
  }

  if (taskDemand.demandLevel === "architecture-reconciliation" || taskDemand.demandLevel === "protected-runtime-judgment") {
    constraints.push({
      type: "owned-files",
      description: "Only explicitly listed files may be modified",
      paths: taskDemand.evidenceSupplied
        .filter((e) => e.type === "owned-files")
        .flatMap((e) => e.paths ?? []),
      enforcement: "pre-flight",
    });
    constraints.push({
      type: "forbidden-files",
      description: "Explicitly forbidden files must not be touched",
      paths: taskDemand.evidenceSupplied
        .filter((e) => e.type === "forbidden-files")
        .flatMap((e) => e.paths ?? []),
      enforcement: "pre-flight",
    });
    constraints.push({
      type: "stop-conditions",
      description: "Stop conditions must be declared and checked continuously",
      enforcement: "continuous",
    });
  }

  if (taskDemand.demandLevel === "protected-runtime-judgment") {
    constraints.push({
      type: "validation-order",
      description: "Pre-flight validators must pass before any live environment interaction",
      enforcement: "pre-flight",
    });
    constraints.push({
      type: "binary-assertions",
      description: "Runtime proof must produce binary pass/fail artifacts",
      enforcement: "post-flight",
    });
  }

  return constraints;
}

export function makeRouteDecision(input: {
  taskDemand: TaskDemand;
  executor: ExecutorCapability;
  decisionId?: string;
  validForMs?: number;
}): RouteDecision {
  const taskDemandLevel = input.taskDemand.demandLevel;
  const executorMaxDemand = input.executor.maxAllowedDemand;
  const executorLane = input.executor.lane;

  const demandMeets = demandMeetsCapability(taskDemandLevel, executorMaxDemand);
  const laneMeets = laneMeetsDemand(executorLane, taskDemandLevel);

  let decision: Decision;
  let allowedLane: RouteDecision["allowedLane"];
  let blockOrDowngradeReason: string | undefined;

  if (executorLane === "blocked") {
    decision = "block";
    allowedLane = "deterministic-repair";
    blockOrDowngradeReason = input.executor.failClosedReason ?? "Executor is blocked";
  } else if (!demandMeets) {
    decision = "downgrade";
    const maxAllowedIdx = demandToIndex(executorMaxDemand);
    allowedLane = LANE_ORDER[maxAllowedIdx] as RouteDecision["allowedLane"];
    blockOrDowngradeReason = `Task demand (${taskDemandLevel}) exceeds executor capability (${executorMaxDemand}). Downgraded to ${allowedLane}.`;
  } else if (!laneMeets) {
    decision = "downgrade";
    const demandIdx = demandToIndex(taskDemandLevel);
    allowedLane = LANE_ORDER[demandIdx] as RouteDecision["allowedLane"];
    blockOrDowngradeReason = `Executor lane (${executorLane}) below required for task demand (${taskDemandLevel}). Downgraded to ${allowedLane}.`;
  } else {
    decision = "allow";
    allowedLane = executorLane as RouteDecision["allowedLane"];
  }

  const requiredConstraints = computeRequiredConstraints(input.taskDemand);
  const factoringGuidance = input.taskDemand.factoringOpportunities.map((f) => ({
    description: f.description,
    reducesTo: f.reducesTo,
    mechanicalCheck: f.mechanicalCheck,
  }));

  const now = new Date();
  const validUntil = new Date(now.getTime() + (input.validForMs ?? 24 * 60 * 60 * 1000));

  const routeDecision: RouteDecision = {
    schemaVersion: 1,
    decisionId: input.decisionId ?? `route-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    taskDemand: {
      taskId: input.taskDemand.taskId,
      demandLevel: input.taskDemand.demandLevel,
      reasoningLeap: input.taskDemand.reasoningLeap,
    },
    executor: {
      executorId: input.executor.executorId,
      maxAllowedDemand: input.executor.maxAllowedDemand,
      lane: input.executor.lane,
    },
    decision,
    allowedLane,
    requiredConstraints,
    blockOrDowngradeReason,
    factoringGuidance,
    createdAt: now.toISOString(),
    validUntil: validUntil.toISOString(),
  };

  return RouteDecisionSchema.parse(routeDecision);
}

export function validateExecutorCapability(executor: unknown): ExecutorCapability {
  return ExecutorCapabilitySchema.parse(executor);
}

export function validateTaskDemand(demand: unknown): TaskDemand {
  return TaskDemandSchema.parse(demand);
}

export function validateRouteDecision(decision: unknown): RouteDecision {
  return RouteDecisionSchema.parse(decision);
}

export { DEMAND_ORDER, LANE_ORDER, demandMeetsCapability, laneMeetsDemand, computeRequiredConstraints };