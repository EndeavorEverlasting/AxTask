/**
 * Helpers for safe Docker cleanup commands.
 */

/**
 * @param {string[]} argv
 * @returns {{ wipeData: boolean; yes: boolean; noPrune: boolean }}
 */
export function parseDockerCleanupArgv(argv) {
  return {
    wipeData: argv.includes("--wipe-data"),
    yes: argv.includes("--yes"),
    noPrune: argv.includes("--no-prune"),
  };
}

/**
 * @param {{ wipeData: boolean }} options
 * @returns {string[]}
 */
export function composeDownArgs(options) {
  const args = ["compose", "--env-file", ".env.docker", "down", "--remove-orphans"];
  if (options.wipeData) {
    args.push("-v");
  }
  return args;
}

