// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  composeDownArgs,
  parseDockerCleanupArgv,
} from "../tools/local/docker-cleanup-lib.mjs";

describe("docker cleanup helpers", () => {
  it("parses safe defaults", () => {
    expect(parseDockerCleanupArgv([])).toEqual({
      wipeData: false,
      yes: false,
      noPrune: false,
    });
  });

  it("parses destructive flags explicitly", () => {
    expect(parseDockerCleanupArgv(["--wipe-data", "--yes", "--no-prune"])).toEqual({
      wipeData: true,
      yes: true,
      noPrune: true,
    });
  });

  it("builds compose down args in safe mode", () => {
    expect(composeDownArgs({ wipeData: false })).toEqual([
      "compose",
      "--env-file",
      ".env.docker",
      "down",
      "--remove-orphans",
    ]);
  });

  it("adds -v only in destructive mode", () => {
    expect(composeDownArgs({ wipeData: true })).toEqual([
      "compose",
      "--env-file",
      ".env.docker",
      "down",
      "--remove-orphans",
      "-v",
    ]);
  });
});

