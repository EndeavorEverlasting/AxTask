/**
 * Contract: spawn `scripts/audit-env.mjs` end-to-end (optional --root for fixtures).
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

const REPO_ROOT = join(__dirname, "../../..");
const AUDIT_CLI = join(REPO_ROOT, "scripts/audit-env.mjs");

let STRICT_TEMPLATE_KEYS: string[];

function spawnAudit(args: string[]) {
  const res = spawnSync(process.execPath, [AUDIT_CLI, ...args], {
    encoding: "utf8",
    env: process.env,
  });
  return {
    status: res.status ?? 1,
    stdout: String(res.stdout ?? ""),
    stderr: String(res.stderr ?? ""),
  };
}

function envTemplate(keys: string[]): string {
  return `${keys.map((k) => `${k}=`).join("\n")}\n`;
}

function renderYamlKeys(keys: string[]): string {
  const lines = keys.map((k) => `      - key: ${k}`).join("\n");
  return `services:\n  - type: web\n    envVars:\n${lines}\n`;
}

describe("[01-env] audit-env.mjs spawn contract", () => {
  beforeAll(async () => {
    const mod = await import(pathToFileURL(join(REPO_ROOT, "scripts/audit-env.mjs")).href);
    STRICT_TEMPLATE_KEYS = mod.STRICT_TEMPLATE_KEYS as string[];
  });

  const tmpDirs: string[] = [];
  afterEach(() => {
    for (const d of tmpDirs.splice(0)) {
      try {
        rmSync(d, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });

  function mkFixture(): string {
    const dir = mkdtempSync(join(tmpdir(), "audit-env-fixture-"));
    tmpDirs.push(dir);
    return dir;
  }

  it("JSON output never echoes assignment values from templates", () => {
    const root = mkFixture();
    const leak = "NEVER_PRINT_THIS_SECRET_VALUE_XYZ";
    mkdirSync(join(root, "server"), { recursive: true });
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "server", "stub.ts"), "// stub\n");
    writeFileSync(join(root, ".env.production.example"), `DATABASE_URL=${leak}\n`);
    writeFileSync(join(root, ".env.render.example"), `DATABASE_URL=${leak}\n`);
    writeFileSync(join(root, "render.yaml"), renderYamlKeys(["DATABASE_URL"]));
    writeFileSync(join(root, "docs", "ENVIRONMENT_VARIABLES.md"), "# catalog\n");

    const { status, stdout } = spawnAudit(["--json", `--root=${root}`]);
    expect(status).toBe(0);
    expect(stdout.indexOf(leak)).toBe(-1);
    expect(stdout).not.toMatch(/DATABASE_URL\s*=\s*[^\s"']/);
  });

  it("reports prod template minus render template divergence", () => {
    const root = mkFixture();
    mkdirSync(join(root, "server"), { recursive: true });
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "server", "stub.ts"), "// stub\n");
    writeFileSync(
      join(root, ".env.production.example"),
      envTemplate(["DATABASE_URL", "EXTRA_ONLY_IN_PROD"]),
    );
    writeFileSync(join(root, ".env.render.example"), envTemplate(["DATABASE_URL"]));
    writeFileSync(join(root, "render.yaml"), renderYamlKeys(["DATABASE_URL"]));
    writeFileSync(join(root, "docs", "ENVIRONMENT_VARIABLES.md"), "`DATABASE_URL`\n");

    const { status, stdout } = spawnAudit(["--json", `--root=${root}`]);
    expect(status).toBe(0);
    const doc = JSON.parse(stdout) as {
      categories: { prodExampleMinusRenderExample: string[] };
    };
    expect(doc.categories.prodExampleMinusRenderExample).toContain("EXTRA_ONLY_IN_PROD");
  });

  it("reports code reference missing from both templates", () => {
    const root = mkFixture();
    mkdirSync(join(root, "server"), { recursive: true });
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(
      join(root, "server", "scan.ts"),
      'const x = process.env.CODE_REF_NOT_IN_TEMPLATES;\n',
    );
    writeFileSync(join(root, ".env.production.example"), envTemplate(["DATABASE_URL"]));
    writeFileSync(join(root, ".env.render.example"), envTemplate(["DATABASE_URL"]));
    writeFileSync(join(root, "render.yaml"), renderYamlKeys(["DATABASE_URL"]));
    writeFileSync(join(root, "docs", "ENVIRONMENT_VARIABLES.md"), "`DATABASE_URL`\n");

    const { status, stdout } = spawnAudit(["--json", `--root=${root}`]);
    expect(status).toBe(0);
    const doc = JSON.parse(stdout) as {
      categories: { codeNotInEitherTemplate: string[] };
    };
    expect(doc.categories.codeNotInEitherTemplate).toContain("CODE_REF_NOT_IN_TEMPLATES");
  });

  it("reports docs-only keys not present in code or templates", () => {
    const root = mkFixture();
    mkdirSync(join(root, "server"), { recursive: true });
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "server", "scan.ts"), "// no env refs\n");
    writeFileSync(join(root, ".env.production.example"), envTemplate(["DATABASE_URL"]));
    writeFileSync(join(root, ".env.render.example"), envTemplate(["DATABASE_URL"]));
    writeFileSync(join(root, "render.yaml"), renderYamlKeys(["DATABASE_URL"]));
    writeFileSync(
      join(root, "docs", "ENVIRONMENT_VARIABLES.md"),
      "Optional docs-only catalog entry `DOCS_ONLY_FIXTURE_KEY`.\n",
    );

    const { status, stdout } = spawnAudit(["--json", `--root=${root}`]);
    expect(status).toBe(0);
    const doc = JSON.parse(stdout) as {
      categories: { docsOnlyNoCodeNoTemplate: string[] };
    };
    expect(doc.categories.docsOnlyNoCodeNoTemplate).toContain("DOCS_ONLY_FIXTURE_KEY");
  });

  it("--strict exits 1 when INVITE_CODE is missing from templates in a fixture", () => {
    const root = mkFixture();
    mkdirSync(join(root, "server"), { recursive: true });
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "server", "scan.ts"), "void process.env.DATABASE_URL;\n");

    const strictSansInvite = STRICT_TEMPLATE_KEYS.filter((k) => k !== "INVITE_CODE");
    writeFileSync(join(root, ".env.production.example"), envTemplate(strictSansInvite));
    writeFileSync(join(root, ".env.render.example"), envTemplate(strictSansInvite));
    writeFileSync(join(root, "render.yaml"), renderYamlKeys(strictSansInvite));
    writeFileSync(join(root, "docs", "ENVIRONMENT_VARIABLES.md"), "`DATABASE_URL`\n");

    const { status, stdout } = spawnAudit(["--json", "--strict", `--root=${root}`]);
    expect(status).toBe(1);
    const doc = JSON.parse(stdout) as { strictFailures: { key: string }[] };
    expect(doc.strictFailures.some((f) => f.key === "INVITE_CODE")).toBe(true);
  });

  it("--strict exits 0 against the real repo (template regression smoke)", () => {
    const { status, stderr } = spawnAudit(["--strict"]);
    expect(stderr).toBe("");
    expect(status).toBe(0);
  });
});
