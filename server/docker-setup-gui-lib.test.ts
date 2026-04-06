// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  applyDockerGuiValues,
  normalizeEnvText,
  syncDatabaseUrlPassword,
  upsertEnvKey,
  validateDockerGuiValues,
} from "../tools/local/docker-setup-gui-lib.mjs";

describe("docker setup gui helpers", () => {
  it("syncs DATABASE_URL password while preserving the rest", () => {
    const input = "postgresql://axtask:oldpass@database:5432/axtask";
    const output = syncDatabaseUrlPassword(input, "newpass123");
    expect(output).toContain("postgresql://axtask:newpass123@database:5432/axtask");
  });

  it("upserts existing keys and appends missing keys", () => {
    const updated = upsertEnvKey("FOO=1\n", "FOO", "2");
    expect(updated).toContain('FOO="2"');

    const appended = upsertEnvKey("FOO=1\n", "BAR", "x");
    expect(appended).toContain('BAR="x"');
  });

  it("applies GUI values and keeps DB password in sync", () => {
    const base = [
      "POSTGRES_PASSWORD=old",
      "DATABASE_URL=postgresql://axtask:old@database:5432/axtask",
      "SESSION_SECRET=abcabcabcabcabcabcabcabcabcabcab",
      "AXTASK_DOCKER_SEED_DEMO=1",
      "DOCKER_DEMO_USER_EMAIL=demo@axtask.local",
      "DOCKER_DEMO_PASSWORD=LocalDockerDemo!ChangeMe",
      "",
    ].join("\n");

    const next = applyDockerGuiValues(base, {
      POSTGRES_PASSWORD: "new123",
      SESSION_SECRET: "0123456789abcdef0123456789abcdef",
      AXTASK_DOCKER_SEED_DEMO: "0",
      DOCKER_DEMO_USER_EMAIL: "new@demo.local",
      DOCKER_DEMO_PASSWORD: "newDemoPass1",
    });

    expect(next).toContain('POSTGRES_PASSWORD="new123"');
    expect(next).toContain('DATABASE_URL="postgresql://axtask:new123@database:5432/axtask"');
    expect(next).toContain('AXTASK_DOCKER_SEED_DEMO="0"');
    expect(next).toContain('DOCKER_DEMO_USER_EMAIL="new@demo.local"');
  });

  it("validates required values", () => {
    expect(
      validateDockerGuiValues({
        POSTGRES_PASSWORD: "",
        SESSION_SECRET: "0123456789abcdef0123456789abcdef",
        AXTASK_DOCKER_SEED_DEMO: "1",
        DOCKER_DEMO_PASSWORD: "abcdefgh",
      }),
    ).toContain("POSTGRES_PASSWORD");

    expect(
      validateDockerGuiValues({
        POSTGRES_PASSWORD: "x",
        SESSION_SECRET: "short",
        AXTASK_DOCKER_SEED_DEMO: "0",
      }),
    ).toContain("SESSION_SECRET");
  });

  it("normalizes CR-only separators so env keys are not merged", () => {
    const broken = "POSTGRES_USER=axtask\rPOSTGRES_PASSWORD=123\rDATABASE_URL=postgresql://axtask:123@database:5432/axtask\r";
    const normalized = normalizeEnvText(broken);
    expect(normalized).toContain("POSTGRES_USER=axtask\nPOSTGRES_PASSWORD=123");

    const next = applyDockerGuiValues(broken, {
      POSTGRES_PASSWORD: "abc123",
      SESSION_SECRET: "0123456789abcdef0123456789abcdef",
      AXTASK_DOCKER_SEED_DEMO: "1",
      DOCKER_DEMO_USER_EMAIL: "demo@axtask.local",
      DOCKER_DEMO_PASSWORD: "LocalDockerDemo!ChangeMe",
    });

    expect(next).toContain("POSTGRES_USER=axtask\n");
    expect(next).toContain('POSTGRES_PASSWORD="abc123"');
    expect(next).toContain(
      'DATABASE_URL="postgresql://axtask:abc123@database:5432/axtask"',
    );
  });
});
