import { describe, expect, test } from "vitest";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { verifyChainedLines } from "../src/harness/hash-chain.js";
import { hiveFactsPath } from "../src/harness/hive.js";
import { interventionsPath, recordIntervention, verifyLedgerChain } from "../src/harness/interventions.js";

const execFileP = promisify(execFile);
const CHILD = fileURLToPath(new URL("./fixtures/chain-append-child.ts", import.meta.url));

async function project(): Promise<{ root: string; ref: string; sha256: string }> {
  const root = await mkdtemp(path.join(tmpdir(), "uh-parallel-append-"));
  const content = "status: passed\n";
  await mkdir(path.join(root, "out"), { recursive: true });
  await writeFile(path.join(root, "out", "verification.yaml"), content, "utf-8");
  return { root, ref: "out/verification.yaml", sha256: createHash("sha256").update(content).digest("hex") };
}

const lines = async (file: string) => (await readFile(file, "utf8")).split("\n").filter(Boolean);

/** Several processes appending at once, the way parallel queue runs and team workers do. */
async function race(mode: "facts" | "ledger", writers: number, each: number) {
  const { root, ref, sha256 } = await project();
  try {
    await Promise.all(Array.from({ length: writers }, (_unused, writer) =>
      execFileP(process.execPath, ["--import", "tsx", CHILD, mode, root, String(each), `w${writer}`, ref, sha256], { cwd: process.cwd() })));
    return await lines(mode === "facts" ? hiveFactsPath(root) : interventionsPath(root));
  } finally { await rm(root, { recursive: true, force: true }); }
}

describe("parallel appends keep the hash chain intact (#257)", () => {
  test("many processes appending hive facts at once never fork the chain", async () => {
    const written = await race("facts", 6, 8);
    expect(written).toHaveLength(48);
    expect(verifyChainedLines(written)).toBeUndefined();
  }, 120_000);

  test("many processes appending interventions at once never fork the chain", async () => {
    const written = await race("ledger", 6, 8);
    expect(written).toHaveLength(48);
    expect(verifyChainedLines(written, { allowLegacyPrefix: true })).toBeUndefined();
  }, 120_000);

  test("concurrent appends inside one process never fork the ledger chain", async () => {
    const { root } = await project();
    try {
      await Promise.all(Array.from({ length: 40 }, (_unused, index) => recordIntervention(root, { source: "orchestrator", trigger: "steer", what: `intervention ${index}` })));
      expect(await lines(interventionsPath(root))).toHaveLength(40);
      expect(verifyLedgerChain(root)).toBeUndefined();
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
