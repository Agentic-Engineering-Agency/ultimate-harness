import { copyFileSync, renameSync, writeFileSync } from "node:fs";
import { relinkForks, readJsonLines, type ChainBreak, type RelinkedEntry } from "./hash-chain.js";
import { withChainLock } from "./chain-lock.js";

export type ChainRepairOutcome =
  | { repaired: true; backup: string; report: string; relinked: RelinkedEntry[] }
  | { repaired: false; reason?: string; break?: ChainBreak };

/**
 * Re-link a hash chain that the old concurrent-append bug forked (#257), under the same lock appends take.
 * Explicit, never automatic. It keeps the original file beside the repaired one (`<file>.pre-repair-<time>`),
 * writes a report of every entry it re-linked (`<file>.repair-report-<time>.json`), and refuses, touching
 * nothing, when the chain has any break other than a fork.
 */
export async function repairChainFile(
  file: string,
  options: { now?: () => Date; allowLegacyPrefix?: boolean },
): Promise<ChainRepairOutcome> {
  return withChainLock(file, () => {
    const lines = readJsonLines(file).filter((line) => line.trim().length > 0);
    const result = relinkForks(lines, { allowLegacyPrefix: options.allowLegacyPrefix });
    if ("error" in result) return { repaired: false as const, break: result.error };
    if (result.relinked.length === 0) return { repaired: false as const, reason: "no fork to repair" };
    const stamp = (options.now ?? (() => new Date()))().toISOString().replace(/[:.]/g, "-");
    const backup = `${file}.pre-repair-${stamp}`;
    const report = `${file}.repair-report-${stamp}.json`;
    copyFileSync(file, backup, 1 /* COPYFILE_EXCL: never overwrite an earlier backup */);
    writeFileSync(report, `${JSON.stringify({ schema_version: "uh.chain-repair.v0", file, repaired_at: new Date().toISOString(), backup, relinked: result.relinked }, null, 2)}\n`, { flag: "wx" });
    const temporary = `${file}.repair-${process.pid}.tmp`;
    writeFileSync(temporary, `${result.lines.join("\n")}\n`, "utf-8");
    renameSync(temporary, file);
    return { repaired: true as const, backup, report, relinked: result.relinked };
  });
}
