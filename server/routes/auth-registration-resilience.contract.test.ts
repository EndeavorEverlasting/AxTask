// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const authSource = fs.readFileSync(
  path.join(repoRoot, "server", "routes", "auth.ts"),
  "utf8",
);

function registrationBlock(): string {
  const start = authSource.indexOf('app.post("/api/auth/register"');
  const end = authSource.indexOf('app.post("/api/auth/login"', start);
  if (start < 0 || end < 0) return "";
  return authSource.slice(start, end);
}

describe("registration DB resilience contract", () => {
  const registration = registrationBlock();

  it("keeps validation errors as 400 but forwards runtime failures to central classification", () => {
    expect(registration).not.toBe("");
    expect(registration).toMatch(/next:\s*NextFunction/);
    expect(registration).toMatch(/error instanceof z\.ZodError/);
    expect(registration).toMatch(/status\(400\)/);
    expect(registration).toMatch(/next\(error\)/);
    expect(registration).not.toMatch(/if \(error instanceof Error\)[\s\S]{0,160}status\(400\)/);
  });

  it("does not make the append-only registration audit event a signup dependency", () => {
    expect(registration).toMatch(/void appendSecurityEvent\(/);
    expect(registration).toMatch(/appendSecurityEvent\([\s\S]{0,700}\.catch\(/);
  });

  it("forwards post-registration login failures instead of emitting an opaque 500", () => {
    expect(registration).toMatch(/req\.login\(user,[\s\S]{0,160}if \(err\) return next\(err\)/);
    expect(registration).not.toContain("Registration succeeded but login failed");
  });
});
