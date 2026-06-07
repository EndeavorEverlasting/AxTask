import { randomBytes } from "node:crypto";

const DEFAULT_HEX_CHARS = 64;

function parsePositiveInt(raw, label) {
  if (raw === undefined || raw === "") {
    throw new Error(`${label} requires a value`);
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new Error(`${label} must be a positive integer`);
  }
  if (n <= 0) {
    throw new Error(`${label} must be greater than zero`);
  }
  return n;
}

export function parseArgs(argv) {
  const args = argv.filter((a) => a !== "--");
  if (args.includes("--help") || args.includes("-h")) {
    return { help: true };
  }

  let chars;
  let bits;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--chars") {
      if (chars !== undefined || bits !== undefined) {
        throw new Error("Specify only one of --chars or --bits");
      }
      chars = parsePositiveInt(args[i + 1], "--chars");
      i += 1;
      continue;
    }
    if (arg.startsWith("--chars=")) {
      if (chars !== undefined || bits !== undefined) {
        throw new Error("Specify only one of --chars or --bits");
      }
      chars = parsePositiveInt(arg.slice("--chars=".length), "--chars");
      continue;
    }
    if (arg === "--bits") {
      if (chars !== undefined || bits !== undefined) {
        throw new Error("Specify only one of --chars or --bits");
      }
      bits = parsePositiveInt(args[i + 1], "--bits");
      i += 1;
      continue;
    }
    if (arg.startsWith("--bits=")) {
      if (chars !== undefined || bits !== undefined) {
        throw new Error("Specify only one of --chars or --bits");
      }
      bits = parsePositiveInt(arg.slice("--bits=".length), "--bits");
      continue;
    }
    if (arg === "--allow-ci-output") {
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (chars !== undefined && bits !== undefined) {
    throw new Error("Specify only one of --chars or --bits");
  }

  return { help: false, chars, bits };
}

export function hexLengthFromOptions(options = {}) {
  const { chars, bits } = options;
  if (chars !== undefined && bits !== undefined) {
    throw new Error("Specify only one of --chars or --bits");
  }
  if (chars !== undefined) {
    if (chars % 2 !== 0) {
      throw new Error("--chars must be an even number");
    }
    return chars;
  }
  if (bits !== undefined) {
    if (bits % 8 !== 0) {
      throw new Error("--bits must be divisible by 8");
    }
    return (bits / 8) * 2;
  }
  return DEFAULT_HEX_CHARS;
}

export function generateHexSecret(options = {}) {
  const hexLen = hexLengthFromOptions(options);
  const byteLen = hexLen / 2;
  return randomBytes(byteLen).toString("hex");
}
