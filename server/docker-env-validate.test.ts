// @vitest-environment node
import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { validateEnvDockerText } from "../tools/local/docker-start-lib.mjs";

const projectRoot = path.resolve(__dirname, "..");

describe("validateEnvDockerText (docker login gate)", () => {
  it("accepts the committed .env.docker.example (no unresolved placeholders)", () => {
    const text = fs.readFileSync(path.join(projectRoot, ".env.docker.example"), "utf8");
    expect(validateEnvDockerText(text)).toBe(null);
  });

  it("rejects placeholder SESSION_SECRET", () => {
    expect(
      validateEnvDockerText("SESSION_SECRET=replace-with-32-plus-char-secret\n"),
    ).toBe("session_secret");
  });

  it("rejects DATABASE_URL replace-me password", () => {
    expect(validateEnvDockerText("DATABASE_URL=postgresql://u:replace-me@db:5432/db\n")).toBe(
      "placeholder",
    );
  });

  it("ignores placeholders that appear only in commented lines", () => {
    expect(
      validateEnvDockerText(
        "# SESSION_SECRET=replace-with-32-plus-char-secret\nSESSION_SECRET=0123456789abcdef0123456789abcdef\n",
      ),
    ).toBe(null);
    expect(validateEnvDockerText("# POSTGRES_PASSWORD=replace-me\nPOSTGRES_PASSWORD=ok\n")).toBe(null);
  });
});
