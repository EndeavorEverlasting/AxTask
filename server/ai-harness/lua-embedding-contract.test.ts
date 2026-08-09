import { afterEach, describe, expect, it } from "vitest";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..", "..");
const validator = path.join(repoRoot, "scripts/ai-harness/validate-lua-embedding.mjs");
const tempRoots: string[] = [];
const run = (root = repoRoot) => spawnSync(process.execPath, [validator, `--root=${root}`, "--json"], { cwd: repoRoot, encoding: "utf8" });
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "axtask-lua-embedding-")); tempRoots.push(root);
  cpSync(path.join(repoRoot, ".ai"), path.join(root, ".ai"), { recursive: true });
  cpSync(path.join(repoRoot, ".githooks"), path.join(root, ".githooks"), { recursive: true });
  cpSync(path.join(repoRoot, "scripts", "ai-harness"), path.join(root, "scripts", "ai-harness"), { recursive: true });
  return root;
}
function change(root: string, rel: string, mutate: (v: any) => void) {
  const f = path.join(root, rel); const v = JSON.parse(readFileSync(f, "utf8")); mutate(v); writeFileSync(f, `${JSON.stringify(v, null, 2)}\n`);
}
afterEach(() => { while (tempRoots.length) rmSync(tempRoots.pop()!, { recursive: true, force: true }); });

describe("Lua embedding harness contract", () => {
  it("validates the harness-only deny-by-default contract", () => {
    const r = run(); expect(r.status, `${r.stdout}\n${r.stderr}`).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({ contractId: "axtask.lua-embedding.v1", adoptionPhase: "harness-only", hostFunctions: 0, openedLibraries: 0, errors: [] });
  });
  it("rejects a script-owned main loop", () => {
    const root=fixture(); change(root,".ai/lua-embedding-contract.json",v=>v.architecture.scriptControlsMainLoop=true); const r=run(root); expect(r.status).toBe(1); expect(r.stdout).toContain("Lua must not control the host main loop");
  });
  it("rejects VM lifecycle without close", () => {
    const root=fixture(); change(root,".ai/lua-embedding-contract.json",v=>v.stateIsolation.closeStateRequired=false); const r=run(root); expect(r.status).toBe(1); expect(r.stdout).toContain("VM state close/destroy is required");
  });
  it("rejects uncaught script errors", () => {
    const root=fixture(); change(root,".ai/lua-embedding-contract.json",v=>v.errorHandling.hostCatchRequired=false); const r=run(root); expect(r.status).toBe(1); expect(r.stdout).toContain("host catch is required");
  });
  it("rejects OS and host exposure during harness-only adoption", () => {
    const root=fixture(); change(root,".ai/lua-sandbox-capabilities.json",v=>{v.openedLibraries=["os"];v.hostFunctions=[{id:"host.clock",owner:"host",purpose:"bounded clock",inputs:["none"],outputs:["timestamp"],preconditions:["registered"],forbidden:["filesystem"],guardrails:["read-only"],tests:["contract"],proofCeiling:"harness"}]}); const r=run(root); expect(r.status).toBe(1); expect(r.stdout).toContain("os/io libraries may not be opened by default"); expect(r.stdout).toContain("harness-only must not expose host functions");
  });
  it("rejects wildcard host exposure", () => {
    const root=fixture(); change(root,".ai/lua-sandbox-capabilities.json",v=>{v.hostFunctions=[{id:"*",owner:"host",purpose:"wildcard",inputs:["none"],outputs:["unknown"],preconditions:["none"],forbidden:["none"],guardrails:["none"],tests:["none"],proofCeiling:"harness"}]}); const r=run(root); expect(r.status).toBe(1); expect(r.stdout).toContain("forbidden wildcard/os/io exposure");
  });
  it("rejects JIT as default", () => {
    const root=fixture(); change(root,".ai/lua-embedding-contract.json",v=>v.execution.jitDefaultEnabled=true); const r=run(root); expect(r.status).toBe(1); expect(r.stdout).toContain("JIT must not be enabled by default");
  });
  it("rejects product mutation authorization", () => {
    const root=fixture(); change(root,".ai/lua-embedding-contract.json",v=>v.adoption.productMutationAuthorized=true); const r=run(root); expect(r.status).toBe(1); expect(r.stdout).toContain("harness-only must not authorize product mutation");
  });
  it("rejects proof above harness ceiling", () => {
    const root=fixture(); change(root,".ai/lua-embedding-contract.json",v=>v.proof.currentCeiling="live-runtime"); const r=run(root); expect(r.status).toBe(1); expect(r.stdout).toContain("harness-only proof ceiling must be harness");
  });
  it("rejects trigger routing drift", () => {
    const root=fixture(); change(root,".ai/trigger-registry.json",v=>v.triggers.find((x:{id?:string})=>x.id==="lua-embedding-requested").workflowId="axtask.repository-intake.v1"); const r=run(root); expect(r.status).toBe(1); expect(r.stdout).toContain("lua-embedding-requested must route to the Lua workflow");
  });
  it("rejects zero-based Lua sequence semantics", () => {
    const root=fixture(); change(root,".ai/lua-embedding-contract.json",v=>v.semantics.luaSequenceIndexBase=0); const r=run(root); expect(r.status).toBe(1); expect(r.stdout).toContain("Lua sequence index base must be 1");
  });
});
