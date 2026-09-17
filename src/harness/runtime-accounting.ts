import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { parse } from "yaml";
import { RuntimeResultSchema, type RuntimeResultDocument } from "../schema/artifacts.js";
import { RuntimeRecoveryRecordSchema } from "../schema/runtime-control.js";
import { assertWritableArtifact } from "../adapters/_artifact-context.js";
import { assertSafeMissionId } from "./mission.js";
import { assertValidRunId } from "./run-id.js";
import { aggregateRuntimeUsage, type RuntimeAccountingFacts } from "./usage.js";

/** Account for each recorded native recovery attempt once, including failures and missing measurements. */
export async function readRuntimeAccounting(root: string, missionId: string, runIds: string[]): Promise<{ facts: RuntimeAccountingFacts; attemptRunIds: string[]; receipts: Array<{ runId: string; digest: string }> }> {
  assertSafeMissionId(missionId);
  const missionDir = path.join(root, ".harness", "missions", missionId);
  const seen = new Set<string>();
  const results: Array<RuntimeResultDocument | undefined> = [];
  const receipts: Array<{ runId: string; digest: string }> = [];
  for (const initialRunId of runIds) {
    let runId: string | undefined = initialRunId;
    const chain = new Set<string>();
    while (runId) {
      assertValidRunId(runId);
      if (chain.has(runId)) throw new Error("Circular runtime recovery lineage");
      chain.add(runId);
      if (seen.has(runId)) break;
      seen.add(runId);
      const directory = path.join(missionDir, "runs", runId);
      const resultPath = path.join(directory, "runtime-result.yaml");
      const recoveryPath = path.join(directory, "runtime-recovery.json");
      for (const file of [directory, resultPath, recoveryPath]) await assertWritableArtifact(missionDir, file);
      try {
        const raw = await readFile(resultPath, "utf8");
        const result = RuntimeResultSchema.parse(parse(raw));
        if (result.mission_id !== missionId) throw new Error("Runtime accounting identity mismatch");
        results.push(result);
        receipts.push({ runId, digest: `sha256:${createHash("sha256").update(raw).digest("hex")}` });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        results.push(undefined);
      }
      try {
        const recovery = RuntimeRecoveryRecordSchema.parse(JSON.parse(await readFile(recoveryPath, "utf8")));
        runId = recovery.source_run_id;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        runId = undefined;
      }
    }
  }
  return { facts: aggregateRuntimeUsage(results), attemptRunIds: [...seen], receipts };
}
