// @vitest-environment node
import path from "path";
import { describe, expect, it, vi } from "vitest";
import {
  dockerDesktopExeCandidates,
  firstExistingPath,
  parseDockerUpArgv,
  validateEnvDockerText,
} from "../tools/local/docker-start-lib.mjs";

describe("docker-start-lib (local stack bootstrap)", () => {
  describe("parseDockerUpArgv", () => {
    it("parses --no-launch and --no-build", () => {
      expect(
        parseDockerUpArgv(["--no-launch", "--no-build", "extra"]),
      ).toEqual({ noLaunch: true, noBuild: true });
    });

    it("defaults flags to false", () => {
      expect(parseDockerUpArgv([])).toEqual({
        noLaunch: false,
        noBuild: false,
      });
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
