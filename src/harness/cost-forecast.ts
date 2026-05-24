import { readFile } from "node:fs/promises";
import path from "node:path";
import { CAPABILITIES, type AdapterId } from "../adapters/capabilities/index.js";
import { COST_CLASSES, type CostClass } from "../schema/adapter-capabilities.js";
import { RunsIndexSchema } from "../schema/runs.js";
import { missionDir, missionRunDir, missionRunsIndex } from "./paths.js";
import { loadMissionFile } from "./capabilities.js";

/**
 * UH-104 — history-based cost forecasting.
 *
 * Averages the token counts captured in past runs' `runtime.usage` events
 * (see src/harness/usage.ts) and prices them with the adapter's cost class.
 * Falls back to a prompt-size heuristic when a mission has no usage history.
 */

export interface UsageSample {
  input_tokens: number;
  output_tokens: number;
  source: string;
  run_id: string;
}

/** Collect `runtime.usage` token samples from a mission's non-archived runs. */
export async function readUsageHistory(root: string, missionId: string): Promise<UsageSample[]> {
  let index: ReturnType<typeof RunsIndexSchema.parse>;
  try {
    index = RunsIndexSchema.parse(JSON.parse(await readFile(missionRunsIndex(root, missionId), "utf-8")));
  } catch {
    return [];
  }
  const samples: UsageSample[] = [];
  for (const entry of index.runs) {
    if (entry.archived) continue; // pruned dir — no events to read
    const eventsPath = path.join(missionRunDir(root, missionId, entry.run_id), "events.ndjson");
    let raw: string;
    try {
      raw = await readFile(eventsPath, "utf-8");
    } catch {
      continue;
    }
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let ev: Record<string, unknown>;
      try {
        ev = JSON.parse(trimmed) as Record<string, unknown>;
      } catch {
        continue;
      }
      if (ev.event !== "runtime.usage") continue;
      samples.push({
        input_tokens: typeof ev.input_tokens === "number" ? ev.input_tokens : 0,
        output_tokens: typeof ev.output_tokens === "number" ? ev.output_tokens : 0,
        source: typeof ev.source === "string" ? ev.source : "estimated",
        run_id: entry.run_id,
      });
    }
  }
  return samples;
}

export type ForecastBasis = "history" | "heuristic";

export interface CostForecast {
  adapter: AdapterId;
  cost_class: CostClass;
  est_input_tokens: number;
  est_output_tokens: number;
  est_cost_usd: number;
  basis: ForecastBasis;
  runs_sampled: number;
}

/** Price tokens with the cost class's $/Mtok rates. */
export function costUsd(cc: CostClass, inputTokens: number, outputTokens: number): number {
  const rate = COST_CLASSES[cc];
  return (inputTokens / 1_000_000) * rate.input + (outputTokens / 1_000_000) * rate.output;
}

function average(nums: number[]): number {
  if (nums.length === 0) return 0;
  return Math.round(nums.reduce((s, n) => s + n, 0) / nums.length);
}

export async function forecastCost(
  root: string,
  missionId: string,
  adapter: AdapterId,
  opts: { outputRatio?: number } = {},
): Promise<CostForecast> {
  const caps = CAPABILITIES[adapter];
  if (!caps) throw new Error(`Unknown adapter for cost-forecast: ${adapter}`);
  const cc = caps.cost_class;

  const history = await readUsageHistory(root, missionId);
  let estInput: number;
  let estOutput: number;
  let basis: ForecastBasis;
  let runsSampled: number;

  if (history.length > 0) {
    estInput = average(history.map((h) => h.input_tokens));
    estOutput = average(history.map((h) => h.output_tokens));
    basis = "history";
    runsSampled = history.length;
  } else {
    // Heuristic fallback: size the mission packet as an input proxy.
    let text = "";
    try {
      const mission = await loadMissionFile(path.join(missionDir(root, missionId), "mission.yaml"));
      text = JSON.stringify(mission);
    } catch {
      text = "";
    }
    estInput = Math.ceil(text.length / 4);
    estOutput = Math.ceil(estInput * (opts.outputRatio ?? 0.5));
    basis = "heuristic";
    runsSampled = 0;
  }

  return {
    adapter,
    cost_class: cc,
    est_input_tokens: estInput,
    est_output_tokens: estOutput,
    est_cost_usd: Number(costUsd(cc, estInput, estOutput).toFixed(6)),
    basis,
    runs_sampled: runsSampled,
  };
}
