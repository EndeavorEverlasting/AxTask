// @vitest-environment node
import path from "path";
import { describe, expect, it, vi } from "vitest";
import {
  detectMigrateAuthFailure,
  dockerDesktopExeCandidates,
  firstExistingPath,
  parseDockerUpArgv,
  parseEnvAssignmentLines,
  readDockerDemoLoginFromEnvText,
  validateEnvDockerText,
} from "../tools/local/docker-start-lib.mjs";

describe("docker-start-lib (local stack bootstrap)", () => {
  describe("parseDockerUpArgv", () => {
    it("parses --no-launch and --no-build", () => {
      expect(
        parseDockerUpArgv(["--no-launch", "--no-build", "extra"]),
      ).toEqual({ noLaunch: true, noBuild: true, withNodeweaver: false });
    });

    it("parses --with-nodeweaver", () => {
      expect(parseDockerUpArgv(["--with-nodeweaver"])).toEqual({
        noLaunch: false,
        noBuild: false,
        withNodeweaver: true,
      });
    });

    it("defaults flags to false", () => {
      expect(parseDockerUpArgv([])).toEqual({
        noLaunch: false,
        noBuild: false,
        withNodeweaver: false,
      });
    });
  });

  describe("parseEnvAssignmentLines", () => {
    it("parses KEY=VALUE and ignores comments", () => {
      const m = parseEnvAssignmentLines(" # c\nFOO=bar\nBAZ='quoted'\n");
      expect(m.FOO).toBe("bar");
      expect(m.BAZ).toBe("quoted");
    });
  });

  describe("readDockerDemoLoginFromEnvText", () => {
    it("returns null when demo seed disabled", () => {
      expect(readDockerDemoLoginFromEnvText("AXTASK_DOCKER_SEED_DEMO=0\n")).toBeNull();
    });

    it("returns email and password when enabled", () => {
      const r = readDockerDemoLoginFromEnvText(
        "AXTASK_DOCKER_SEED_DEMO=1\nDOCKER_DEMO_USER_EMAIL=a@b.com\nDOCKER_DEMO_PASSWORD=secret1234\n",
      );
      expect(r).toEqual({ email: "a@b.com", password: "secret1234" });
    });

    it("flags missing password", () => {
      const r = readDockerDemoLoginFromEnvText("AXTASK_DOCKER_SEED_DEMO=true\nDOCKER_DEMO_USER_EMAIL=a@b.com\n");
      expect(r).toEqual({ email: "a@b.com", passwordMissing: true });
    });
  });

  describe("validateEnvDockerText", () => {
    it("accepts realistic env content without placeholders", () => {
      expect(
        validateEnvDockerText(
          "SESSION_SECRET=0123456789abcdef0123456789abcdef\nPOSTGRES_PASSWORD=secret\nDATABASE_URL=postgresql://axtask:secret@database:5432/axtask\n",
        ),
      ).toBeNull();
    });

    it("rejects SESSION_SECRET placeholder first", () => {
      expect(
        validateEnvDockerText(
          "SESSION_SECRET=replace-with-32-plus-char-secret\nPOSTGRES_PASSWORD=ok\n",
        ),
      ).toBe("session_secret");
    });

    it("rejects replace-me placeholders", () => {
      expect(
        validateEnvDockerText("POSTGRES_PASSWORD=replace-me\n"),
      ).toBe("placeholder");
    });
  });

  describe("detectMigrateAuthFailure", () => {
    it("detects auth failures from migrate logs", () => {
      const logs = [
        "axtask-migrate  | > drizzle-kit push",
        'axtask-migrate  | error: password authentication failed for user "axtask"',
      ].join("\n");
      expect(detectMigrateAuthFailure(logs)).toBe(true);
    });

    it("ignores unrelated failures", () => {
      const logs = "axtask-migrate  | Error: migration file not found";
      expect(detectMigrateAuthFailure(logs)).toBe(false);
    });
  });

  describe("dockerDesktopExeCandidates", () => {
    it("builds ordered Windows paths from env", () => {
      const wj = path.win32.join;
      const paths = dockerDesktopExeCandidates({
        ProgramFiles: "C:\\Program Files",
        "ProgramFiles(x86)": "C:\\Program Files (x86)",
        LOCALAPPDATA: "C:\\Users\\x\\AppData\\Local",
      } as NodeJS.ProcessEnv);
      expect(paths).toEqual([
        wj("C:\\Program Files", "Docker", "Docker", "Docker Desktop.exe"),
        wj("C:\\Program Files (x86)", "Docker", "Docker", "Docker Desktop.exe"),
        wj("C:\\Users\\x\\AppData\\Local", "Docker", "Docker Desktop.exe"),
      ]);
    });
  });

  describe("firstExistingPath", () => {
    it("returns first path that exists", () => {
      const exists = vi.fn((p: string) => p === "/b");
      expect(firstExistingPath(["/a", "/b", "/c"], exists)).toBe("/b");
      expect(exists).toHaveBeenCalledWith("/a");
      expect(exists).toHaveBeenCalledWith("/b");
    });

    it("returns null when none exist", () => {
      expect(firstExistingPath(["/nope"], () => false)).toBeNull();
    });
  });
});
