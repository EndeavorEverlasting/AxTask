import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import contract from "../../.ai/agent-workspace-contract.json";
import {
  acquireWorkspaceLock,
  assessDeletionEligibility,
  diagnoseWorkspaces,
  isTempLikeWorkspace,
  managedRootProblem,
  resolveManagedRoot,
  worktreeAddPlan,
} from "../../scripts/ai-harness/workspaces.mjs";
import {
  expectedAgentWorkspaceSchema,
  validateAgentWorkspaceContract,
  validateAgentWorkspacePolicy,
  validateAgentWorkspaceSchemaDefinition,
} from "../../scripts/ai-harness/validate-agent-workspaces.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("agent workspace ownership harness", () => {
  it("validates the real repository contract and wiring", () => {
    expect(validateAgentWorkspaceContract(repoRoot).errors).toEqual([]);
  });

  it("keeps the tracked schema structurally identical to the complete fail-closed schema", () => {
    const schema = JSON.parse(fs.readFileSync(path.join(repoRoot, ".ai", "agent-workspace-contract.schema.json"), "utf8"));
    expect(schema).toEqual(expectedAgentWorkspaceSchema());
    const weakened = structuredClone(schema);
    delete weakened.properties.cleanup.properties.forceRemovalAllowed.const;
    expect(validateAgentWorkspaceSchemaDefinition(weakened)).toContain("workspace schema differs from the complete fail-closed schema contract");
  });

  it("resolves the default managed root as a human-visible repository sibling", () => {
    expect(resolveManagedRoot("/work/AxTask", {} as NodeJS.ProcessEnv)).toBe(path.resolve("/work/AxTask-worktrees"));
  });

  it("honors an explicit disjoint workspace-root override", () => {
    expect(resolveManagedRoot("/work/AxTask", { AXTASK_AGENT_WORKSPACE_ROOT: "/managed/axtask" } as NodeJS.ProcessEnv)).toBe(path.resolve("/managed/axtask"));
    expect(managedRootProblem("/work/AxTask", "/managed/axtask", "/tmp")).toBeNull();
  });

  it("rejects managed roots inside or surrounding the repository", () => {
    expect(managedRootProblem("/work/AxTask", "/work/AxTask/.worktrees", "/tmp")).toContain("inside the repository");
    expect(managedRootProblem("/work/AxTask", "/work", "/tmp")).toContain("contain the primary repository");
  });

  it("resolves symlinked managed roots before containment checks", () => {
    const fixture = fs.mkdtempSync(path.join(path.dirname(repoRoot), "axtask-workspace-symlink-"));
    try {
      const repo = path.join(fixture, "repo");
      const nestedTarget = path.join(repo, ".nested-worktrees");
      const link = path.join(fixture, "managed-link");
      fs.mkdirSync(nestedTarget, { recursive: true });
      fs.symlinkSync(nestedTarget, link, process.platform === "win32" ? "junction" : "dir");
      expect(managedRootProblem(repo, link, os.tmpdir())).toContain("inside the repository");
    } finally {
      fs.rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("recognizes Windows AppData and POSIX temp roots", () => {
    expect(isTempLikeWorkspace("C:\\Users\\CHEEKS\\AppData\\Local\\Temp\\opencode\\pr121-repair", "/not-temp")).toBe(true);
    expect(isTempLikeWorkspace("/tmp/opencode/pr121-repair", "/different-temp")).toBe(true);
    expect(isTempLikeWorkspace("/var/tmp/axtask", "/different-temp")).toBe(true);
  });

  it("serializes registry mutations with an exclusive inter-process lock", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "axtask-workspace-lock-"));
    try {
      const release = acquireWorkspaceLock(root, "test-one");
      expect(() => acquireWorkspaceLock(root, "test-two")).toThrow("agent workspace registry is locked");
      release();
      const releaseAgain = acquireWorkspaceLock(root, "test-three");
      releaseAgain();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("reuses an existing local branch instead of trying to recreate it", () => {
    expect(worktreeAddPlan({
      branch: "feature/existing",
      workspacePath: "/managed/existing",
      baseRef: "origin/main",
      localBranchExists: true,
      remoteBranchExists: true,
    })).toEqual({
      args: ["worktree", "add", "/managed/existing", "feature/existing"],
      sourceRef: "feature/existing",
      createdBranch: false,
    });
    expect(worktreeAddPlan({
      branch: "feature/new",
      workspacePath: "/managed/new",
      baseRef: "origin/main",
      localBranchExists: false,
      remoteBranchExists: false,
    }).args).toEqual(["worktree", "add", "-b", "feature/new", "/managed/new", "origin/main"]);
  });

  it("allows the primary checkout outside the managed root but rejects an unmanaged secondary", () => {
    const result = diagnoseWorkspaces({
      repoRoot: "/work/AxTask",
      managedRoot: "/work/AxTask-worktrees",
      currentPath: "/work/AxTask",
      worktrees: [
        { path: "/work/AxTask", head: "a", branch: "main", detached: false },
        { path: "/elsewhere/pr", head: "b", branch: "feature", detached: false },
      ],
      registryEntries: [],
      diskDirs: [],
      tempRoot: "/tmp",
    });
    expect(result.violations.map((item) => item.code)).toContain("UNMANAGED_SECONDARY_WORKTREE");
    expect(result.currentViolations).toEqual([]);
  });

  it("rejects managed worktrees without registry entries and stale registry entries", () => {
    const result = diagnoseWorkspaces({
      repoRoot: "/work/AxTask",
      managedRoot: "/work/AxTask-worktrees",
      currentPath: "/work/AxTask-worktrees/feature",
      worktrees: [
        { path: "/work/AxTask", head: "a", branch: "main", detached: false },
        { path: "/work/AxTask-worktrees/feature", head: "b", branch: "feature", detached: false },
      ],
      registryEntries: [{ id: "stale", taskId: "AXQ-1", owner: "agent", path: "/work/AxTask-worktrees/missing", branch: "missing", baseRef: "origin/main", baseSha: "a", purpose: "test", createdAt: "now", status: "PRESERVE" }],
      diskDirs: ["/work/AxTask-worktrees/feature"],
      tempRoot: "/tmp",
    });
    expect(result.violations.map((item) => item.code)).toEqual(expect.arrayContaining(["MISSING_REGISTRY_ENTRY", "REGISTRY_WITHOUT_WORKTREE"]));
  });

  it("never treats a temp secondary worktree as acceptable durable state", () => {
    const result = diagnoseWorkspaces({
      repoRoot: "C:\\Dev\\AxTask",
      managedRoot: "C:\\Dev\\AxTask-worktrees",
      currentPath: "C:\\Users\\CHEEKS\\AppData\\Local\\Temp\\opencode\\repair",
      worktrees: [
        { path: "C:\\Dev\\AxTask", head: "a", branch: "main", detached: false },
        { path: "C:\\Users\\CHEEKS\\AppData\\Local\\Temp\\opencode\\repair", head: "b", branch: "repair", detached: false },
      ],
      registryEntries: [],
      diskDirs: [],
      tempRoot: "C:\\Users\\CHEEKS\\AppData\\Local\\Temp",
    });
    expect(result.violations.map((item) => item.code)).toEqual(expect.arrayContaining(["TEMP_SECONDARY_WORKTREE", "UNMANAGED_SECONDARY_WORKTREE"]));
  });

  it("requires REMOVE + named + clean + merged + secondary before cleanup", () => {
    expect(assessDeletionEligibility({ status: "REMOVE", primary: false, clean: true, merged: true }).safe).toBe(true);
    expect(assessDeletionEligibility({ status: "ACTIVE", primary: false, clean: true, merged: true }).safe).toBe(false);
    expect(assessDeletionEligibility({ status: "REMOVE", primary: false, clean: false, merged: true }).safe).toBe(false);
    expect(assessDeletionEligibility({ status: "REMOVE", primary: false, clean: true, merged: false }).safe).toBe(false);
    expect(assessDeletionEligibility({ status: "REMOVE", primary: true, clean: true, merged: true }).safe).toBe(false);
    expect(assessDeletionEligibility({ status: "REMOVE", primary: false, clean: true, merged: true, detached: true }).safe).toBe(false);
    expect(assessDeletionEligibility({ status: "REMOVE", primary: false, clean: true, merged: true, branchMatches: false }).safe).toBe(false);
  });

  it("fails closed when the policy allows scattered, nested, or destructive workspace behavior", () => {
    const unsafe = structuredClone(contract) as any;
    unsafe.workspaceRoot.managedRootMayBeInsideRepository = true;
    unsafe.workspaceRoot.managedRootMayContainRepository = true;
    unsafe.durableWorkspacePolicy.rawGitWorktreeCreationByAgents = true;
    unsafe.durableWorkspacePolicy.agentClonesAllowed = true;
    unsafe.durableWorkspacePolicy.uniqueRepoStateInTempAllowed = true;
    unsafe.cleanup.forceRemovalAllowed = true;
    unsafe.cleanup.deleteBranch = true;
    expect(validateAgentWorkspacePolicy(unsafe)).toEqual(expect.arrayContaining([
      "managed workspace root must remain outside the repository",
      "managed workspace root must not contain the repository",
      "agents must not create durable worktrees outside the helper",
      "agent-owned duplicate clones must remain forbidden",
      "unique repository state in temp must remain forbidden",
      "force removal must remain forbidden",
      "cleanup must preserve branches",
    ]));
  });
});
