import { mkdir, readFile, writeFile, appendFile, access } from "node:fs/promises";
import path from "node:path";
import { parse, stringify } from "yaml";
import {
  RuntimeResultSchema,
  type RuntimeResultDocument,
  type VerdictValue,
} from "../schema/artifacts.js";
import { harnessDir, missionsDir } from "./paths.js";

export type RecordVerdictInput = {
  root: string;
  missionId: string;
  value: VerdictValue;
  rationale?: string;
  /** Override the mission directory; default: `<root>/.harness/missions/<id>`. */
  missionDir?: string;
  /** Override the timestamp used in the artifact + audit log (tests). */
  now?: string;
};

export type RecordVerdictResult = {
  runtimeResultPath: string;
  document: RuntimeResultDocument;
  auditLine: string;
};

const AUDIT_LOG_RELATIVE = "audit.log";

/**
 * UH-76 — record a manual verdict on an existing `runtime-result.yaml`,
 * preserving every other field. Appends a line to `.harness/audit.log`
 * matching `<iso-ts> verdict.recorded <mission_id> <value> by=manual`.
 *
 * Re-invocations are idempotent over the runtime-result file: subsequent calls
 * overwrite the verdict block in place. Each call appends a fresh audit line
 * so the timeline of decisions is preserved.
 */
export async function recordManualVerdict(input: RecordVerdictInput): Promise<RecordVerdictResult> {
  const missionDir = input.missionDir ?? path.join(missionsDir(input.root), input.missionId);
  const runtimeResultPath = path.join(missionDir, "runtime-result.yaml");
  await assertExists(runtimeResultPath);
  const raw = await readFile(runtimeResultPath, "utf-8");
  const parsed = parse(raw);
  // Strip a pre-existing verdict so we re-validate from a clean shape.
  if (parsed && typeof parsed === "object") {
    delete (parsed as Record<string, unknown>).verdict;
  }
  const existing = RuntimeResultSchema.parse(parsed);
  const recordedAt = input.now ?? new Date().toISOString();
  const rationale = (input.rationale ?? "").trim();
  if (input.value !== "pass" && rationale.length === 0) {
    throw new Error("Manual non-pass verdicts require --rationale");
  }
  const next: RuntimeResultDocument = {
    ...existing,
    verdict: {
      value: input.value,
      rationale,
      recorded_by: "manual",
      recorded_at: recordedAt,
    },
  };
  // Re-validate the whole document to be sure we never write something
  // the schema would reject.
  const validated = RuntimeResultSchema.parse(next);
  await writeFile(runtimeResultPath, stringify(validated), "utf-8");

  const auditLine = `${recordedAt} verdict.recorded ${input.missionId} ${input.value} by=manual`;
  const auditPath = path.join(harnessDir(input.root), AUDIT_LOG_RELATIVE);
  await mkdir(path.dirname(auditPath), { recursive: true });
  await appendFile(auditPath, `${auditLine}\n`, "utf-8");

  return { runtimeResultPath, document: validated, auditLine };
}

async function assertExists(filePath: string): Promise<void> {
  try {
    await access(filePath);
  } catch {
    throw new Error(`runtime-result.yaml not found: ${filePath}`);
  }
}
