import type { DriftDetectOptions } from "./detect-options.js";
import type { DriftIssue, DriftKind, DriftKindModule, RepairResult } from "./types.js";
import { staleWorkerKind } from "./kinds/stale-worker.js";
import { orphanedWorktreeKind } from "./kinds/orphaned-worktree.js";
import { roadmapLinearDivergenceKind } from "./kinds/roadmap-linear-divergence.js";
import { missingCompletionTimestampKind } from "./kinds/missing-completion-timestamp.js";
import { truncatedEventsNdjsonKind } from "./kinds/truncated-events-ndjson.js";
import { staleRenderKind } from "./kinds/stale-render.js";
import { orphanedRunDirKind } from "./kinds/orphaned-run-dir.js";
import { specStaleKind } from "./kinds/spec-stale.js";

/**
 * UH-77 drift registry, declared in execution order. The order matters: when
 * `repair` is enabled, we run detectors → repairs → detectors again, and the
 * cap of two cycles means surviving issues are reported as "drift remains".
 */
export const DRIFT_KINDS: readonly DriftKindModule[] = [
  staleWorkerKind,
  orphanedWorktreeKind,
  orphanedRunDirKind,
  missingCompletionTimestampKind,
  truncatedEventsNdjsonKind,
  staleRenderKind,
  roadmapLinearDivergenceKind,
  specStaleKind,
];

export const REPAIR_CYCLE_CAP = 2;

export interface DriftRunOutcome {
  /** Final list of issues after all cycles. Empty when fully repaired. */
  issues: DriftIssue[];
  /** Aggregated repair attempts across cycles. */
  repairs: RepairResult[];
  /** Cycles performed. 0 when repair is disabled. */
  cycles: number;
  /** True when repair cap was hit and issues still remain. */
  capReached: boolean;
}

export type IssuesByKind = Record<DriftKind, DriftIssue[]>;

export function emptyIssuesByKind(): IssuesByKind {
  return {
    "stale-worker": [],
    "orphaned-worktree": [],
    "orphaned-run-dir": [],
    "roadmap-linear-divergence": [],
    "missing-completion-timestamp": [],
    "truncated-events-ndjson": [],
    "stale-render": [],
    "spec-stale": [],
  };
}

export async function detectAll(root: string, options?: DriftDetectOptions): Promise<DriftIssue[]> {
  const out: DriftIssue[] = [];
  for (const kind of DRIFT_KINDS) {
    out.push(...await kind.detect(root, options));
  }
  return out;
}

export function groupByKind(issues: DriftIssue[]): IssuesByKind {
  const map = emptyIssuesByKind();
  for (const issue of issues) {
    map[issue.kind].push(issue);
  }
  return map;
}

/**
 * UH-77 detect → repair → detect orchestrator.
 *
 * - `repair: false` runs detectors once and returns issues without mutation.
 * - `repair: true` runs at most `REPAIR_CYCLE_CAP` cycles. Each cycle:
 *     1. detect
 *     2. for every issue: invoke its `repair` (skipped when canRepair=false)
 *     3. re-detect; stop when issues are empty.
 *
 * Cap protects against repair functions that re-create their own drift —
 * which would otherwise infinite-loop. Surviving issues are still surfaced
 * with their last repair outcome attached.
 */
export async function runDrift(
  root: string,
  options: { repair?: boolean; strictSpec?: boolean } = {},
): Promise<DriftRunOutcome> {
  const repair = options.repair === true;
  const detectOptions: DriftDetectOptions = {
    strictSpec: options.strictSpec === true,
  };
  if (!repair) {
    const issues = await detectAll(root, detectOptions);
    return { issues, repairs: [], cycles: 0, capReached: false };
  }

  const kindIndex = new Map<DriftKind, DriftKindModule>();
  for (const k of DRIFT_KINDS) kindIndex.set(k.kind, k);

  let issues = await detectAll(root, detectOptions);
  const repairs: RepairResult[] = [];
  let cycles = 0;
  while (issues.length > 0 && cycles < REPAIR_CYCLE_CAP) {
    cycles += 1;
    for (const issue of issues) {
      const module = kindIndex.get(issue.kind);
      if (!module || !module.canRepair) {
        repairs.push({
          issue,
          outcome: "needs-human",
          reason: module ? "Warning-only kind has no automatic repair" : "Unknown kind",
        });
        continue;
      }
      const result = await module.repair(issue, root);
      repairs.push(result);
    }
    issues = await detectAll(root, detectOptions);
    // If every remaining issue is warning-only / needs-human, stop early —
    // additional cycles cannot help.
    if (issues.every((i) => {
      const m = kindIndex.get(i.kind);
      return m ? !m.canRepair : true;
    })) {
      break;
    }
  }
  return {
    issues,
    repairs,
    cycles,
    capReached: cycles >= REPAIR_CYCLE_CAP && issues.some((i) => {
      const m = kindIndex.get(i.kind);
      return m ? m.canRepair : false;
    }),
  };
}
