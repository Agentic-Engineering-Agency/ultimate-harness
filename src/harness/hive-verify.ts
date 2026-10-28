import path from "node:path";
import { repairChainFile, type ChainRepairOutcome } from "./chain-repair.js";
import { readJsonLines, verifyChainedLinesTolerant, type ChainBreak } from "./hash-chain.js";
import { hiveFactsPath } from "./hive.js";
import { interventionsPath } from "./interventions.js";
import { landDecisionsPath } from "./land.js";

export interface HiveChainCheck {
  name: string;
  /** Project-relative path, forward slashes. */
  file: string;
  first_broken: ChainBreak | null;
  /** Lines whose entry links to the same parent as the entry before it: the fork the old append bug made. */
  forks: number[];
}

function chains(root: string): Array<{ name: string; absolute: string; legacy: boolean }> {
  return [
    { name: "hive.facts", absolute: hiveFactsPath(root), legacy: false },
    { name: "ledger.interventions", absolute: interventionsPath(root), legacy: true },
    { name: "land.decisions", absolute: landDecisionsPath(root), legacy: false },
  ];
}

const relative = (root: string, file: string) => path.relative(path.resolve(root), file).replaceAll("\\", "/");

/** Verify every hash chain under a project, telling a fork apart from any other break. */
export function verifyHiveChains(root: string): HiveChainCheck[] {
  return chains(root).map(({ name, absolute, legacy }) => {
    const { hard, forks } = verifyChainedLinesTolerant(readJsonLines(absolute), { allowLegacyPrefix: legacy });
    return { name, file: relative(root, absolute), first_broken: hard ?? null, forks };
  });
}

export interface HiveChainRepair {
  name: string;
  file: string;
  outcome: ChainRepairOutcome;
}

/** Re-link the forked chains. Explicit: nothing calls this but `uh hive verify --repair`. */
export async function repairHiveChains(root: string): Promise<HiveChainRepair[]> {
  const repairs: HiveChainRepair[] = [];
  for (const { name, absolute, legacy } of chains(root)) {
    repairs.push({ name, file: relative(root, absolute), outcome: await repairChainFile(absolute, { allowLegacyPrefix: legacy }) });
  }
  return repairs;
}
