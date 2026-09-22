// GitNexus rule exempt: new module, no existing symbols edited.
// Shadow-only loop watchdog. It is a pure observer: it records what it would
// have advised as advisory decision receipts and never stops, pauses, resumes,
// messages or otherwise changes the control flow of a run. It reuses the
// deterministic projection and the shadow probe in `loop-probe.ts`, and every
// failure it can produce is caught by its caller so a run is never failed by it.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parse } from "yaml";
import { MissionSchema } from "../schema/mission.js";
import {
  DEFAULT_ACTIVITY_WINDOW,
  MIN_PROBE_CALLS,
  deterministicLoopSignals,
  evaluateLoopProbe,
  projectActivity,
  serializeLoopProbeState,
  type ActivitySource,
  type ActivityWindow,
  type LoopProbeAnswers,
} from "./loop-probe.js";
import { evaluateSystemOne, type EvaluateSystemOneOptions, type SystemOneResult } from "./typesafe.js";
import { recordLoopWatchdogDecision } from "./decision-receipts.js";
import type { DecisionProviderStatus, LoopWatchdogAnswer, LoopWatchdogOutcome } from "../schema/decisions.js";

/** Default cadence: evaluate after every six newly completed tool calls. */
export const DEFAULT_EVERY_CALLS = 6;
/** A window with this many identical repeats is worth asking the provider about. */
export const IDENTICAL_REPEAT_THRESHOLD = 3;
/** A window with this many A-B-A transitions is worth asking the provider about. */
export const ALTERNATING_PAIR_THRESHOLD = 2;

/**
 * The System One call `evaluateLoopProbe` makes. Injectable so tests substitute
 * a fake and never construct a request.
 */
export type LoopWatchdogProvider = (options: EvaluateSystemOneOptions) => Promise<SystemOneResult>;

/** "shadow" records advisory receipts; "off" observes nothing at all. */
export type LoopWatchdogMode = "shadow" | "off";

export interface LoopWatchdogOptions {
  source: ActivitySource;
  workingDirectory?: string;
  /** Evaluate every this many newly completed tool calls. */
  everyCalls?: number;
  /** Never evaluate below this many completed calls. */
  minCalls?: number;
  provider?: LoopWatchdogProvider;
  clock?: () => number;
  mode?: LoopWatchdogMode;
  /** Root of the owning mission; receipts are written under `decision-receipts/`. */
  missionDir?: string;
  missionId?: string;
  runId?: string;
  /** Appends a `loop_watchdog_error` event to the run's own event log. */
  appendEvent?: (event: Record<string, unknown>) => Promise<void>;
}

export interface LoopWatchdog {
  /** Observe the full native event list seen so far; resolves once any receipt is persisted. */
  observe(events: readonly unknown[]): Promise<void>;
  /** The number of advisory evaluations actually recorded. */
  readonly evaluations: number;
}

/** A projection window large enough to count every completed call, not just the retained slice. */
const COUNT_WINDOW = Number.MAX_SAFE_INTEGER;

const digest = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function signalsCrossed(signals: { identical_repeats: number; alternating_pairs: number }): boolean {
  return signals.identical_repeats >= IDENTICAL_REPEAT_THRESHOLD ||
    signals.alternating_pairs >= ALTERNATING_PAIR_THRESHOLD;
}

function toAnswers(answers: LoopProbeAnswers | undefined): Record<string, LoopWatchdogAnswer> | undefined {
  if (!answers) return undefined;
  const reduced: Record<string, LoopWatchdogAnswer> = {};
  for (const [key, answer] of Object.entries(answers)) {
    if (!answer) continue;
    reduced[key] = {
      ...(answer.noul === undefined ? {} : { noul: answer.noul }),
      ...(answer.choice === undefined ? {} : { choice: answer.choice }),
      ...(answer.probabilities === undefined ? {} : { probabilities: answer.probabilities }),
    };
  }
  return Object.keys(reduced).length > 0 ? reduced : undefined;
}

/**
 * Resolve the mission's `runtime_config.loop_watchdog` switch. Returns
 * `undefined` when the mission cannot be read or validated, so a malformed
 * packet degrades to "no watchdog" rather than failing a run. Absent config
 * defaults to `shadow`.
 */
export async function resolveLoopWatchdogMode(missionPath: string): Promise<LoopWatchdogMode | undefined> {
  try {
    const mission = MissionSchema.parse(parse(await readFile(missionPath, "utf8")));
    return mission.runtime_config?.loop_watchdog ?? "shadow";
  } catch {
    return undefined;
  }
}

/**
 * Build a shadow loop watchdog. `observe` is given the full native event list
 * seen so far, and only projects and evaluates every `everyCalls` newly
 * completed tool calls. The provider is consulted only when the deterministic
 * signals cross a threshold, and the result is always recorded as an advisory
 * receipt — the watchdog never returns a control decision.
 */
export function createLoopWatchdog(options: LoopWatchdogOptions): LoopWatchdog {
  const everyCalls = options.everyCalls ?? DEFAULT_EVERY_CALLS;
  const minCalls = options.minCalls ?? MIN_PROBE_CALLS;
  const clock = options.clock ?? Date.now;
  const mode = options.mode ?? "shadow";
  const provider = options.provider ?? evaluateSystemOne;
  let lastCounted = 0;
  let evaluations = 0;

  const appendError = async (detail: string, error: unknown): Promise<void> => {
    try {
      await options.appendEvent?.({
        event: "loop_watchdog_error",
        timestamp: new Date(clock()).toISOString(),
        ...(options.missionId === undefined ? {} : { mission_id: options.missionId }),
        ...(options.runId === undefined ? {} : { run_id: options.runId }),
        detail,
        message: error instanceof Error ? error.message : String(error),
      });
    } catch {
      // A watchdog failure of any kind must never fail the run.
    }
  };

  const evaluate = async (projected: ActivityWindow): Promise<void> => {
    const window: ActivityWindow = {
      source: projected.source,
      window: DEFAULT_ACTIVITY_WINDOW,
      generated_at: projected.generated_at,
      calls: projected.calls.slice(-DEFAULT_ACTIVITY_WINDOW),
    };
    const signals = deterministicLoopSignals(window);
    if (!signalsCrossed(signals)) return;

    const result = await evaluateLoopProbe(window, { provider });
    if (result.kind === "skipped") return;

    const outcome: LoopWatchdogOutcome = result.kind;
    const provider_status: DecisionProviderStatus = result.kind === "ok" ? "available" : result.kind;
    const reason = `Shadow loop watchdog: ${signals.identical_repeats} identical repeats, ` +
      `${signals.alternating_pairs} alternating pairs across ${window.calls.length} completed calls; ` +
      `provider ${outcome}; recorded advisorily with no control-flow effect.`;

    if (options.missionDir !== undefined && options.missionId !== undefined) {
      await recordLoopWatchdogDecision(options.missionDir, {
        missionId: options.missionId,
        runId: options.runId,
        provider_outcome: outcome,
        provider_status,
        signals,
        answers: result.kind === "ok" ? toAnswers(result.answers) : undefined,
        model: result.kind === "ok" ? result.model : undefined,
        usage: result.kind === "ok" ? result.usage : undefined,
        latency_ms: result.kind === "ok" ? result.latency_ms : undefined,
        input_sha256: digest(serializeLoopProbeState(window)),
        response_sha256: result.kind === "ok"
          ? digest({ model: result.model, answers: result.answers, usage: result.usage })
          : undefined,
        reason,
        created_at: new Date(clock()).toISOString(),
      });
    }
    evaluations += 1;
  };

  const observe = async (events: readonly unknown[]): Promise<void> => {
    if (mode === "off") return;
    try {
      const projected = projectActivity(events, {
        window: COUNT_WINDOW,
        workingDirectory: options.workingDirectory,
      });
      const total = projected.calls.length;
      if (total < minCalls) return;
      if (total - lastCounted < everyCalls) return;
      lastCounted = total;
      await evaluate(projected);
    } catch (error) {
      await appendError("observe", error);
    }
  };

  return {
    observe,
    get evaluations(): number {
      return evaluations;
    },
  };
}
