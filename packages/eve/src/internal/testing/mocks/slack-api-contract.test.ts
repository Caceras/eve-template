import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { SLACK_API_METHODS } from "#internal/testing/mocks/slack-api-contract.js";

const SLACK_SOURCE_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../public/channels/slack",
);

/**
 * The contract's other half. The types stop us naming a method that does
 * not exist or stubbing the wrong response shape; this stops the
 * contract growing entries nothing exercises.
 *
 * Its real limit, stated plainly: it scans for `allow("…")` in the Slack
 * tests, so it only sees methods a test reaches. A production call path
 * with no test coverage is invisible to it — as it is to any local
 * artifact. It is a guard against contract rot, not proof of coverage.
 *
 * Scanning test sources works here where scanning production source does
 * not: 7 of these methods never appear as literals in channel source
 * because they are issued from inside the vendored Slack adapter, but
 * every stub is written as a literal `allow("method")` by construction.
 */
describe("Slack API contract parity", () => {
  it("has an entry for every method the Slack tests stub, and no others", async () => {
    const files = (await readdir(SLACK_SOURCE_DIR)).filter((name) => name.endsWith(".test.ts"));
    const stubbed = new Set<string>();

    for (const file of files) {
      const source = await readFile(join(SLACK_SOURCE_DIR, file), "utf8");
      for (const match of source.matchAll(/\.allow\(\s*"([^"]+)"/g)) {
        stubbed.add(match[1]!);
      }
    }

    expect(files.length).toBeGreaterThan(0);
    expect([...stubbed].sort()).toEqual([...SLACK_API_METHODS]);
  });
});
