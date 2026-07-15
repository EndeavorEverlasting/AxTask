from pathlib import Path

TEST_PATH = Path("client/src/components/layout/sidebar.wallet-poll.test.ts")
TEST_PATH.write_text(
    '''// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(__dirname, "sidebar.tsx"), "utf8");
const WALLET_QUERY_KEY = 'queryKey: ["/api/gamification/wallet"]';

function extractWalletQueryConfig(): string {
  const keyIndex = SRC.indexOf(WALLET_QUERY_KEY);
  if (keyIndex < 0) throw new Error("Sidebar wallet query key is missing");

  const queryStart = SRC.lastIndexOf("useQuery", keyIndex);
  const queryEnd = SRC.indexOf("});", keyIndex);
  if (queryStart < 0 || queryEnd < 0) {
    throw new Error("Unable to isolate sidebar wallet query configuration");
  }

  return SRC.slice(queryStart, queryEnd + 3);
}

const WALLET_QUERY = extractWalletQueryConfig();

function propertyValues(property: string): string[] {
  const pattern = new RegExp(`(?:^|\\n)\\s*${property}\\s*:\\s*([^,\\n}]+)`, "g");
  return Array.from(WALLET_QUERY.matchAll(pattern), (match) => match[1].trim());
}

describe("Sidebar wallet polling contract", () => {
  it("disables interval refetch for the wallet query", () => {
    expect(propertyValues("refetchInterval")).toEqual(["false"]);
  });

  it("disables background interval refetch explicitly", () => {
    expect(propertyValues("refetchIntervalInBackground")).toEqual(["false"]);
  });

  it("keeps the wallet query bound to the expected endpoint", () => {
    expect(WALLET_QUERY).toContain(WALLET_QUERY_KEY);
  });
});
''',
    encoding="utf-8",
)
