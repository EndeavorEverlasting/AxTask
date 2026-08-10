#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..");
const REQUIRED_FIELDS = ["id", "taskId", "owner", "path", "branch", "baseRef", "baseSha", "purpose", "createdAt", "status"];
const TEMP_MATCHERS = ["os.tmpdir", "AppData/Local/Temp", "/tmp", "/var/tmp"];
const WORKING_DIFF_COMMAND = "node scripts/ai-harness/validate-working-diff.mjs";
const PRECOMMIT_DIFF_COMMAND = `${WORKING_DIFF_COMMAND} --staged`;

function readJson(root, relativePath, errors) {
  try { return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8")); }
  catch (error) { errors.push(`${relativePath}: ${error instanceof Error ? error.message : String(error)}`); return null; }
}

function readText(root, relativePath, errors) {
  try { return fs.readFileSync(path.join(root, relativePath), "utf8"); }
  catch (error) { errors.push(`${relativePath}: ${error instanceof Error ? error.message : String(error)}`); return ""; }
}

function hasId(items, id) { return Array.isArray(items) && items.some((item) => item?.id === id); }
function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted(value[key])]));
  return value;
}
function sameStructure(a, b) { return JSON.stringify(sorted(a)) === JSON.stringify(sorted(b)); }

export function expectedAgentWorkspaceSchema() {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "axtask.agent-workspace-ownership.v1",
    type: "object",
    additionalProperties: false,
    required: ["schemaVersion", "authorityRef", "contractId", "workspaceRoot", "durableWorkspacePolicy", "registry", "cleanup", "diffHygiene", "validation"],
    properties: {
      schemaVersion: { const: 1 },
      authorityRef: { const: "axtask.agent-authority.v1" },
      contractId: { const: "axtask.agent-workspace-ownership.v1" },
      workspaceRoot: {
        type: "object", additionalProperties: false,
        required: ["defaultStrategy", "siblingSuffix", "environmentOverride", "primaryWorktreeMayLiveOutsideManagedRoot", "managedRootMayBeInsideRepository", "managedRootMayContainRepository"],
        properties: {
          defaultStrategy: { const: "repository-sibling" },
          siblingSuffix: { type: "string", minLength: 1 },
          environmentOverride: { const: "AXTASK_AGENT_WORKSPACE_ROOT" },
          primaryWorktreeMayLiveOutsideManagedRoot: { const: true },
          managedRootMayBeInsideRepository: { const: false },
          managedRootMayContainRepository: { const: false },
        },
      },
      durableWorkspacePolicy: {
        type: "object", additionalProperties: false,
        required: ["type", "managedRootRequiredForSecondary", "rawGitWorktreeCreationByAgents", "agentClonesAllowed", "uniqueRepoStateInTempAllowed", "forbiddenTempMatchers"],
        properties: {
          type: { const: "git-worktree-only" },
          managedRootRequiredForSecondary: { const: true },
          rawGitWorktreeCreationByAgents: { const: false },
          agentClonesAllowed: { const: false },
          uniqueRepoStateInTempAllowed: { const: false },
          forbiddenTempMatchers: { const: TEMP_MATCHERS },
        },
      },
      registry: {
        type: "object", additionalProperties: false,
        required: ["fileName", "location", "tracked", "statuses", "requiredFields"],
        properties: {
          fileName: { const: ".axtask-agent-workspaces.json" },
          location: { const: "managed-workspace-root" },
          tracked: { const: false },
          statuses: { const: ["ACTIVE", "PRESERVE", "REMOVE"] },
          requiredFields: { const: REQUIRED_FIELDS },
        },
      },
      cleanup: {
        type: "object", additionalProperties: false,
        required: ["statusRequired", "cleanWorktreeRequired", "lineEndingOnlyTrackedNoiseAllowed", "stagedOrUntrackedChangesAllowed", "semanticTrackedChangesAllowed", "headAncestorOf", "forceRemovalAllowed", "forceRemovalForProvenLineEndingOnlyNoise", "deleteBranch", "pruneAfterRemoval"],
        properties: {
          statusRequired: { const: "REMOVE" },
          cleanWorktreeRequired: { const: true },
          lineEndingOnlyTrackedNoiseAllowed: { const: true },
          stagedOrUntrackedChangesAllowed: { const: false },
          semanticTrackedChangesAllowed: { const: false },
          headAncestorOf: { const: "origin/main" },
          forceRemovalAllowed: { const: false },
          forceRemovalForProvenLineEndingOnlyNoise: { const: true },
          deleteBranch: { const: false },
          pruneAfterRemoval: { const: true },
        },
      },
      diffHygiene: {
        type: "object", additionalProperties: false,
        required: ["committedRangeCheck", "workingTreeCheck", "preCommitCheck", "ignoreCrAtEolForWorkingTree", "lineEndingOnlyTrackedNoiseIgnored", "stagedWhitespaceFails", "semanticTrackedWhitespaceFails", "rawWorkingTreeDiffCheckRequired"],
        properties: {
          committedRangeCheck: { const: "git diff --check <base>...HEAD" },
          workingTreeCheck: { const: WORKING_DIFF_COMMAND },
          preCommitCheck: { const: PRECOMMIT_DIFF_COMMAND },
          ignoreCrAtEolForWorkingTree: { const: true },
          lineEndingOnlyTrackedNoiseIgnored: { const: true },
          stagedWhitespaceFails: { const: true },
          semanticTrackedWhitespaceFails: { const: true },
          rawWorkingTreeDiffCheckRequired: { const: false },
        },
      },
      validation: {
        type: "object", additionalProperties: false,
        required: ["hookMode", "operatorAuditMode", "personalPathsTracked"],
        properties: {
          hookMode: { const: "strict-current" },
          operatorAuditMode: { const: "strict-all" },
          personalPathsTracked: { const: false },
        },
      },
    },
  };
}

export function validateAgentWorkspaceSchemaDefinition(schema) {
  return sameStructure(schema, expectedAgentWorkspaceSchema()) ? [] : ["workspace schema differs from the complete fail-closed schema contract"];
}

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
  for (const marker of TEMP_MATCHERS) if (!policy?.forbiddenTempMatchers?.includes(marker)) errors.push(`missing temp matcher ${marker}`);
  const statuses = contract?.registry?.statuses ?? [];
  for (const status of ["ACTIVE", "PRESERVE", "REMOVE"]) if (!statuses.includes(status)) errors.push(`missing registry status ${status}`);
  for (const field of REQUIRED_FIELDS) if (!contract?.registry?.requiredFields?.includes(field)) errors.push(`missing registry field ${field}`);
  if (contract?.registry?.tracked !== false) errors.push("machine-local workspace registry must remain untracked");
  if (contract?.cleanup?.statusRequired !== "REMOVE") errors.push("cleanup must require REMOVE status");
  if (contract?.cleanup?.cleanWorktreeRequired !== true) errors.push("cleanup must require a semantically clean worktree");
  if (contract?.cleanup?.lineEndingOnlyTrackedNoiseAllowed !== true) errors.push("cleanup must explicitly classify proven line-ending-only tracked noise as non-unique state");
  if (contract?.cleanup?.stagedOrUntrackedChangesAllowed !== false) errors.push("cleanup must reject staged or untracked changes");
  if (contract?.cleanup?.semanticTrackedChangesAllowed !== false) errors.push("cleanup must reject semantic tracked changes");
  if (contract?.cleanup?.headAncestorOf !== "origin/main") errors.push("cleanup merge proof must target origin/main");
  if (contract?.cleanup?.forceRemovalAllowed !== false) errors.push("general force removal must remain forbidden");
  if (contract?.cleanup?.forceRemovalForProvenLineEndingOnlyNoise !== true) errors.push("force removal may be used only for proven line-ending-only tracked noise");
  if (contract?.cleanup?.deleteBranch !== false) errors.push("cleanup must preserve branches");
  if (contract?.cleanup?.pruneAfterRemoval !== true) errors.push("cleanup must prune stale worktree metadata");
  const diffHygiene = contract?.diffHygiene;
  if (diffHygiene?.committedRangeCheck !== "git diff --check <base>...HEAD") errors.push("committed-range diff hygiene must remain strict git diff --check");
  if (diffHygiene?.workingTreeCheck !== WORKING_DIFF_COMMAND) errors.push("working-tree diff hygiene must use the repo-owned EOL-aware validator");
  if (diffHygiene?.preCommitCheck !== PRECOMMIT_DIFF_COMMAND) errors.push("pre-commit diff hygiene must validate the staged diff");
  if (diffHygiene?.ignoreCrAtEolForWorkingTree !== true) errors.push("working-tree diff hygiene must ignore CR-only checkout noise at EOL");
  if (diffHygiene?.lineEndingOnlyTrackedNoiseIgnored !== true) errors.push("proven line-ending-only tracked noise must not block working-tree diff hygiene");
  if (diffHygiene?.stagedWhitespaceFails !== true) errors.push("staged whitespace errors must fail");
  if (diffHygiene?.semanticTrackedWhitespaceFails !== true) errors.push("semantic tracked whitespace errors must fail");
  if (diffHygiene?.rawWorkingTreeDiffCheckRequired !== false) errors.push("raw working-tree git diff --check must not be required on EOL-noisy checkouts");
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
  if (schema) errors.push(...validateAgentWorkspaceSchemaDefinition(schema));

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
  for (const commandId of ["agent-workspace-root", "agent-workspace-list", "agent-workspace-create", "agent-workspace-doctor", "agent-workspace-classify", "agent-workspace-cleanup"]) if (!hasId(map?.commands, commandId)) errors.push(`codebase map missing ${commandId}`);

  const diffValidator = readText(rootDir, "scripts/ai-harness/validate-working-diff.mjs", errors);
  for (const token of ["diff", "--cached", "--check", "--ignore-cr-at-eol", "inspectWorkspaceCleanliness"]) if (!diffValidator.includes(token)) errors.push(`working diff validator missing ${token}`);

  const workflow = readText(rootDir, ".ai/workflows/agent-workspace-lifecycle.md", errors);
  for (const heading of ["## Use when", "## Inputs", "## Steps", "## Known traps", "## Outputs", "## Stop conditions", "## Proof ceiling"]) if (!workflow.includes(heading)) errors.push(`workspace workflow missing ${heading}`);
  if (!workflow.includes(WORKING_DIFF_COMMAND)) errors.push("workspace workflow missing EOL-aware working diff validation");
  const skill = readText(rootDir, ".ai/skills/agent-workspace-lifecycle.md", errors);
  if (!skill.includes("axtask.skill.agent-workspace-lifecycle.v1") || !skill.includes("workspaces.mjs create") || !skill.includes("workspaces.mjs doctor") || !skill.includes(WORKING_DIFF_COMMAND)) errors.push("workspace skill missing executable lifecycle/diff contract");
  const report = readText(rootDir, ".ai/reports/agent-workspace-report-template.md", errors);
  for (const heading of ["## REPOSITORY", "## MANAGED ROOT", "## WORKSPACES", "## DIFF HYGIENE", "## WORKING", "## BROKEN", "## MISSING", "## CLEANUP SAFETY", "## PROOF CEILING", "## NEXT ACTION"]) if (!report.includes(heading)) errors.push(`workspace report missing ${heading}`);
  const readme = readText(rootDir, ".ai/README.md", errors);
  for (const text of ["workspaces.mjs doctor --strict-current", "workspaces.mjs create", "AppData/Local/Temp", WORKING_DIFF_COMMAND]) if (!readme.includes(text)) errors.push(`.ai/README.md missing workspace guidance: ${text}`);
  const preCommit = readText(rootDir, ".githooks/pre-commit", errors);
  if (!preCommit.includes("validate-agent-workspaces.mjs") || !preCommit.includes("workspaces.mjs doctor --strict-current") || !preCommit.includes(PRECOMMIT_DIFF_COMMAND)) errors.push(".githooks/pre-commit missing workspace/diff enforcement");
  const prePush = readText(rootDir, ".githooks/pre-push", errors);
  if (!prePush.includes("validate-agent-workspaces.mjs") || !prePush.includes("workspaces.mjs doctor --strict-current")) errors.push(".githooks/pre-push missing workspace enforcement");
  const ci = readText(rootDir, ".github/workflows/harness-agent-workspaces.yml", errors);
  if (!ci.includes(WORKING_DIFF_COMMAND) || !ci.includes('git diff --check "origin/${GITHUB_BASE_REF}...HEAD"')) errors.push("workspace CI must prove both working-tree EOL hygiene and committed-range whitespace hygiene");
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
