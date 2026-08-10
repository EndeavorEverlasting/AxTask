#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..");

function readJson(root, relativePath, errors) {
  try { return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8")); }
  catch (error) { errors.push(`${relativePath}: ${error instanceof Error ? error.message : String(error)}`); return null; }
}

function readText(root, relativePath, errors) {
  try { return fs.readFileSync(path.join(root, relativePath), "utf8"); }
  catch (error) { errors.push(`${relativePath}: ${error instanceof Error ? error.message : String(error)}`); return ""; }
}

function hasId(items, id) { return Array.isArray(items) && items.some((item) => item?.id === id); }

export function validateAgentWorkspacePolicy(contract) {
  const errors = [];
  if (contract?.authorityRef !== "axtask.agent-authority.v1") errors.push("authorityRef mismatch");
  if (contract?.contractId !== "axtask.agent-workspace-ownership.v1") errors.push("contractId mismatch");
  if (contract?.workspaceRoot?.defaultStrategy !== "repository-sibling") errors.push("workspace root must default to repository-sibling");
  if (contract?.workspaceRoot?.environmentOverride !== "AXTASK_AGENT_WORKSPACE_ROOT") errors.push("workspace root override must be AXTASK_AGENT_WORKSPACE_ROOT");
  if (contract?.workspaceRoot?.primaryWorktreeMayLiveOutsideManagedRoot !== true) errors.push("primary worktree exception must remain explicit");
  if (contract?.workspaceRoot?.managedRootMayBeInsideRepository !== false) errors.push("managed workspace root must remain outside the repository");
  if (contract?.workspaceRoot?.managedRootMayContainRepository !== false) errors.push("managed workspace root must not contain the repository");
  const policy = contract?.durableWorkspacePolicy;
  if (policy?.type !== "git-worktree-only") errors.push("durable agent isolation must be git-worktree-only");
  if (policy?.managedRootRequiredForSecondary !== true) errors.push("secondary worktrees must use managed root");
  if (policy?.rawGitWorktreeCreationByAgents !== false) errors.push("agents must not create durable worktrees outside the helper");
  if (policy?.agentClonesAllowed !== false) errors.push("agent-owned duplicate clones must remain forbidden");
  if (policy?.uniqueRepoStateInTempAllowed !== false) errors.push("unique repository state in temp must remain forbidden");
  for (const marker of ["os.tmpdir", "AppData/Local/Temp", "/tmp", "/var/tmp"]) if (!policy?.forbiddenTempMatchers?.includes(marker)) errors.push(`missing temp matcher ${marker}`);
  const statuses = contract?.registry?.statuses ?? [];
  for (const status of ["ACTIVE", "PRESERVE", "REMOVE"]) if (!statuses.includes(status)) errors.push(`missing registry status ${status}`);
  for (const field of ["id", "taskId", "owner", "path", "branch", "baseRef", "baseSha", "purpose", "createdAt", "status"]) if (!contract?.registry?.requiredFields?.includes(field)) errors.push(`missing registry field ${field}`);
  if (contract?.registry?.tracked !== false) errors.push("machine-local workspace registry must remain untracked");
  if (contract?.cleanup?.statusRequired !== "REMOVE") errors.push("cleanup must require REMOVE status");
  if (contract?.cleanup?.cleanWorktreeRequired !== true) errors.push("cleanup must require clean worktree");
  if (contract?.cleanup?.headAncestorOf !== "origin/main") errors.push("cleanup merge proof must target origin/main");
  if (contract?.cleanup?.forceRemovalAllowed !== false) errors.push("force removal must remain forbidden");
  if (contract?.cleanup?.deleteBranch !== false) errors.push("cleanup must preserve branches");
  if (contract?.cleanup?.pruneAfterRemoval !== true) errors.push("cleanup must prune stale worktree metadata");
  if (contract?.validation?.hookMode !== "strict-current") errors.push("hook mode must remain strict-current");
  if (contract?.validation?.operatorAuditMode !== "strict-all") errors.push("operator audit mode must remain strict-all");
  if (contract?.validation?.personalPathsTracked !== false) errors.push("personal paths must never be tracked");
  return errors;
}

export function validateAgentWorkspaceContract(rootDir = DEFAULT_REPO_ROOT) {
  const errors = [];
  const contract = readJson(rootDir, ".ai/agent-workspace-contract.json", errors);
  const schema = readJson(rootDir, ".ai/agent-workspace-contract.schema.json", errors);
  if (contract) errors.push(...validateAgentWorkspacePolicy(contract));
  if (schema?.type !== "object" || schema?.$id !== "axtask.agent-workspace-ownership.v1") errors.push("workspace schema root/id mismatch");
  if (!Array.isArray(schema?.required) || !schema.required.includes("cleanup") || !schema.required.includes("durableWorkspacePolicy")) errors.push("workspace schema missing required policy sections");
  for (const key of ["managedRootMayBeInsideRepository", "managedRootMayContainRepository"]) if (!schema?.properties?.workspaceRoot?.required?.includes(key)) errors.push(`workspace schema must require ${key}`);

  const harness = readJson(rootDir, ".ai/harness.json", errors);
  const workflows = readJson(rootDir, ".ai/workflow-registry.json", errors);
  const capabilities = readJson(rootDir, ".ai/capability-registry.json", errors);
  const triggers = readJson(rootDir, ".ai/trigger-registry.json", errors);
  const artifacts = readJson(rootDir, ".ai/artifact-registry.json", errors);
  const validators = readJson(rootDir, ".ai/validator-registry.json", errors);
  const map = readJson(rootDir, ".ai/codebase-map.json", errors);

  for (const componentId of ["agent-workspace-contract", "agent-workspace-contract-schema", "agent-workspace-workflow", "agent-workspace-skill", "agent-workspace-tool", "agent-workspace-validator", "agent-workspace-report", "agent-workspace-contract-test", "agent-workspace-ci"]) if (!hasId(harness?.components, componentId)) errors.push(`harness missing component ${componentId}`);
  if (!harness?.skills?.includes("axtask.skill.agent-workspace-lifecycle.v1")) errors.push("harness missing agent workspace skill registration");
  if (!hasId(workflows?.workflows, "axtask.agent-workspace-lifecycle.v1")) errors.push("workflow registry missing agent workspace lifecycle");
  if (!hasId(capabilities?.capabilities, "agent-workspace-lifecycle")) errors.push("capability registry missing agent-workspace-lifecycle");
  const trigger = triggers?.triggers?.find((item) => item?.id === "agent-workspace-needed");
  if (trigger?.workflowId !== "axtask.agent-workspace-lifecycle.v1") errors.push("agent-workspace-needed trigger routing mismatch");
  const reportArtifact = artifacts?.artifacts?.find((item) => item?.id === "agent-workspace-report");
  if (reportArtifact?.template !== ".ai/reports/agent-workspace-report-template.md" || reportArtifact?.tracked !== false) errors.push("agent-workspace-report artifact wiring mismatch");
  const validator = validators?.validators?.find((item) => item?.id === "agent-workspaces");
  if (validator?.command !== "node scripts/ai-harness/validate-agent-workspaces.mjs") errors.push("agent-workspaces validator command mismatch");
  for (const commandId of ["agent-workspace-root", "agent-workspace-list", "agent-workspace-create", "agent-workspace-doctor", "agent-workspace-cleanup"]) if (!hasId(map?.commands, commandId)) errors.push(`codebase map missing ${commandId}`);

  const workflow = readText(rootDir, ".ai/workflows/agent-workspace-lifecycle.md", errors);
  for (const heading of ["## Use when", "## Inputs", "## Steps", "## Known traps", "## Outputs", "## Stop conditions", "## Proof ceiling"]) if (!workflow.includes(heading)) errors.push(`workspace workflow missing ${heading}`);
  const skill = readText(rootDir, ".ai/skills/agent-workspace-lifecycle.md", errors);
  if (!skill.includes("axtask.skill.agent-workspace-lifecycle.v1") || !skill.includes("workspaces.mjs create") || !skill.includes("workspaces.mjs doctor")) errors.push("workspace skill missing executable lifecycle contract");
  const report = readText(rootDir, ".ai/reports/agent-workspace-report-template.md", errors);
  for (const heading of ["## REPOSITORY", "## MANAGED ROOT", "## WORKSPACES", "## WORKING", "## BROKEN", "## MISSING", "## CLEANUP SAFETY", "## PROOF CEILING", "## NEXT ACTION"]) if (!report.includes(heading)) errors.push(`workspace report missing ${heading}`);
  const readme = readText(rootDir, ".ai/README.md", errors);
  for (const text of ["workspaces.mjs doctor --strict-current", "workspaces.mjs create", "AppData/Local/Temp"]) if (!readme.includes(text)) errors.push(`.ai/README.md missing workspace guidance: ${text}`);
  for (const hook of [".githooks/pre-commit", ".githooks/pre-push"]) {
    const text = readText(rootDir, hook, errors);
    if (!text.includes("validate-agent-workspaces.mjs") || !text.includes("workspaces.mjs doctor --strict-current")) errors.push(`${hook} missing workspace enforcement`);
  }
  return { errors, contractId: contract?.contractId ?? null };
}

function main() {
  const root = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_REPO_ROOT;
  const result = validateAgentWorkspaceContract(root);
  if (result.errors.length) {
    console.error(`[agent-workspace-contract] FAIL contract=${result.contractId ?? "unknown"}`);
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else console.log(`[agent-workspace-contract] PASS contract=${result.contractId}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
