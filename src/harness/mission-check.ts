import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { validateMission, type MissionDocument } from "../schema/mission.js";
import { planHermesRun } from "../adapters/hermes.js";
import { planCodexRun } from "../adapters/codex.js";
import { planOhMyPiRun } from "../adapters/oh-my-pi.js";
import { planCommandCodeRun } from "../adapters/command-code.js";
import { planHermesProxyRun } from "../adapters/hermes-proxy.js";
import { planOpenRouterRun } from "../adapters/openrouter.js";
import { planAnthropicRun } from "../adapters/anthropic.js";
import { planPiRun } from "../adapters/pi.js";
import { planClaudeCodeRun } from "../adapters/claude-code.js";
import { planAcpRun } from "../adapters/acp.js";

/**
 * UH mission check — validate a packet before it launches.
 *
 * The check catches the launch failures that have actually happened: broken
 * YAML, self-contradictions the schema can see, `context.read_first` files that
 * do not exist, declared outputs outside `guard.write_roots`, `Change only`
 * constraints naming unknown paths, `runtime_config_overrides` the chosen
 * runtime rejects, and grounding claims whose literal is absent from the file.
 *
 * It never starts a runtime and never writes to `.harness`. Override validation
 * reuses the exact planner each adapter's `uh mission dry-run` calls
 * (dry-run = planner + artifact persistence); the check deliberately invokes
 * the planner so the artifact-writing half of dry-run is skipped and validation
 * cannot drift from a real launch.
 */

export interface MissionCheckLine {
  name: string;
  status: "PASS" | "FAIL";
  reason?: string;
}

export interface MissionCheckResult {
  mission_id: string | null;
  mission_path: string;
  ok: boolean;
  checks: MissionCheckLine[];
}

export interface MissionCheckOptions {
  root: string;
  /** Mission packet path; relative paths resolve against `root`. */
  missionPath: string;
  /**
   * Runtime to validate the packet's `runtime_config_overrides` against. For a
   * single-shape packet it defaults to `hermes`, exactly like `uh mission
   * dry-run`; each team worker is validated against its own declared adapter.
   */
  runtime?: string;
}

const DEFAULT_RUNTIME = "hermes";

interface RuntimePlanOptions {
  extraRuntimeConfigOverrides?: Record<string, unknown>;
}
type RuntimePlanner = (root: string, missionPath: string, options: RuntimePlanOptions) => Promise<unknown>;

/**
 * Planners keyed by adapter id. Each is the same function the adapter's
 * `dryRun*` wrapper calls to validate `runtime_config_overrides`; the check
 * stops at the planner so no run directory or prompt artifact is created.
 */
const RUNTIME_PLANNERS: Record<string, RuntimePlanner> = {
  hermes: (root, missionPath, options) => planHermesRun(root, missionPath, { extraRuntimeConfigOverrides: options.extraRuntimeConfigOverrides }),
  codex: (root, missionPath, options) => planCodexRun(root, missionPath, { extraRuntimeConfigOverrides: options.extraRuntimeConfigOverrides }),
  "oh-my-pi": (root, missionPath, options) => planOhMyPiRun(root, missionPath, { extraRuntimeConfigOverrides: options.extraRuntimeConfigOverrides }),
  "command-code": (root, missionPath, options) => planCommandCodeRun(root, missionPath, { extraRuntimeConfigOverrides: options.extraRuntimeConfigOverrides }),
  "hermes-proxy": (root, missionPath, options) => planHermesProxyRun(root, missionPath, { extraRuntimeConfigOverrides: options.extraRuntimeConfigOverrides }),
  openrouter: (root, missionPath, options) => planOpenRouterRun(root, missionPath, { extraRuntimeConfigOverrides: options.extraRuntimeConfigOverrides }),
  anthropic: (root, missionPath, options) => planAnthropicRun(root, missionPath, { extraRuntimeConfigOverrides: options.extraRuntimeConfigOverrides }),
  pi: (root, missionPath, options) => planPiRun(root, missionPath, { extraRuntimeConfigOverrides: options.extraRuntimeConfigOverrides }),
  "claude-code": (root, missionPath, options) => planClaudeCodeRun(root, missionPath, { extraRuntimeConfigOverrides: options.extraRuntimeConfigOverrides }),
  acp: (root, missionPath, options) => planAcpRun(root, missionPath, { extraRuntimeConfigOverrides: options.extraRuntimeConfigOverrides }),
};

function normalizeRelativePath(candidate: string): string {
  return candidate.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/\/+$/, "").toLowerCase();
}

/** True when `candidate` equals or lives under the repo-relative `root`. */
function isWithinRoot(candidate: string, root: string): boolean {
  const normalizedRoot = normalizeRelativePath(root);
  if (normalizedRoot.length === 0 || normalizedRoot === ".") return true;
  const normalized = normalizeRelativePath(candidate);
  return normalized === normalizedRoot || normalized.startsWith(`${normalizedRoot}/`);
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

function extractPlanErrors(plan: unknown): string[] {
  if (plan && typeof plan === "object" && "errors" in plan) {
    const errors = (plan as { errors?: unknown }).errors;
    if (Array.isArray(errors)) return errors.filter((entry): entry is string => typeof entry === "string");
  }
  return [];
}

type PushLine = (status: "PASS" | "FAIL", name: string, reason?: string) => void;

function makePusher(lines: MissionCheckLine[]): PushLine {
  return (status, name, reason) => {
    lines.push(reason === undefined ? { name, status } : { name, status, reason });
  };
}

/**
 * Extract candidate repo paths named by a `Change only ...` constraint. Only
 * tokens that look like paths (contain a separator or a file extension) are
 * returned, so prose around the list is ignored.
 */
export function extractChangeOnlyPaths(constraint: string): string[] {
  const marker = constraint.search(/change only/i);
  if (marker < 0) return [];
  const tail = constraint.slice(marker + "change only".length);
  const paths: string[] = [];
  for (const rawToken of tail.split(/[\s,]+/)) {
    const token = rawToken.replace(/^[`"'([]+/, "").replace(/[`"').:;\]]+$/, "");
    if (token.length === 0) continue;
    if (token.includes("/") || /\.[A-Za-z0-9]+$/.test(token)) paths.push(token);
  }
  return paths;
}

async function checkRuntimeOverrides(
  push: PushLine,
  root: string,
  missionPath: string,
  runtime: string,
  extraOverrides: Record<string, unknown> | undefined,
  name: string,
): Promise<void> {
  const planner = RUNTIME_PLANNERS[runtime];
  if (!planner) {
    push("FAIL", name, `unknown runtime: ${runtime}`);
    return;
  }
  try {
    const plan = await planner(root, missionPath, extraOverrides ? { extraRuntimeConfigOverrides: extraOverrides } : {});
    const errors = extractPlanErrors(plan);
    if (errors.length > 0) push("FAIL", name, errors.join("; "));
    else push("PASS", name);
  } catch (error) {
    push("FAIL", name, (error as Error).message);
  }
}

async function checkReadFirst(push: PushLine, root: string, mission: MissionDocument, suffix: string): Promise<void> {
  for (const relative of mission.read_first) {
    const name = `read_first ${relative}${suffix}`;
    if (await pathExists(path.resolve(root, relative))) push("PASS", name);
    else push("FAIL", name, "path does not exist");
  }
}

async function checkExpectedOutputs(
  push: PushLine,
  outputs: readonly string[],
  writeRoots: readonly string[],
  suffix: string,
): Promise<void> {
  const roots = writeRoots.join(", ");
  for (const output of outputs) {
    const name = `expected_output ${output}${suffix}`;
    if (writeRoots.some((root) => isWithinRoot(output, root))) push("PASS", name);
    else push("FAIL", name, `outside guard.write_roots [${roots}]`);
  }
}

async function checkConstraints(
  push: PushLine,
  root: string,
  constraints: readonly string[],
  writeRoots: readonly string[],
  suffix: string,
): Promise<void> {
  const roots = writeRoots.join(", ");
  for (const constraint of constraints) {
    for (const candidate of extractChangeOnlyPaths(constraint)) {
      const name = `constraint ${candidate}${suffix}`;
      if (await pathExists(path.resolve(root, candidate))) {
        push("PASS", name);
      } else if (writeRoots.some((writeRoot) => isWithinRoot(candidate, writeRoot))) {
        push("PASS", name);
      } else {
        push("FAIL", name, `"Change only" path does not exist and is not inside a write root [${roots}]`);
      }
    }
  }
}

async function checkGrounding(push: PushLine, root: string, mission: MissionDocument, suffix: string): Promise<void> {
  for (const claim of mission.grounding) {
    const name = `grounding "${claim.claim}"${suffix}`;
    let content: string;
    try {
      content = await readFile(path.resolve(root, claim.path), "utf-8");
    } catch {
      push("FAIL", name, `file does not exist: ${claim.path}`);
      continue;
    }
    if (content.includes(claim.contains)) push("PASS", name);
    else push("FAIL", name, `"${claim.path}" does not contain the literal "${claim.contains}"`);
  }
}

export async function checkMissionPackets(options: MissionCheckOptions): Promise<MissionCheckResult> {
  const root = path.resolve(options.root);
  const missionPath = path.isAbsolute(options.missionPath)
    ? options.missionPath
    : path.resolve(root, options.missionPath);
  const lines: MissionCheckLine[] = [];
  const push = makePusher(lines);

  const finish = (missionId: string | null): MissionCheckResult => ({
    mission_id: missionId,
    mission_path: missionPath,
    ok: lines.every((line) => line.status === "PASS"),
    checks: lines,
  });

  let raw: string;
  try {
    raw = await readFile(missionPath, "utf-8");
  } catch (error) {
    push("FAIL", "schema", `mission file not readable: ${(error as Error).message}`);
    return finish(null);
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (error) {
    push("FAIL", "schema", `YAML parse error: ${(error as Error).message}`);
    return finish(null);
  }

  let mission: MissionDocument;
  try {
    mission = validateMission(parsed);
  } catch (error) {
    push("FAIL", "schema", `mission validation failed: ${(error as Error).message}`);
    return finish(null);
  }
  push("PASS", "schema");

  const parentWriteRoots = mission.guard?.write_roots ?? ["."];

  // A team packet's overrides are merged into each worker, so its own runtime
  // check is only meaningful when the operator pins one with --runtime.
  const parentRuntime = mission.shape === "team" ? options.runtime : (options.runtime ?? DEFAULT_RUNTIME);
  if (parentRuntime) {
    await checkRuntimeOverrides(push, root, missionPath, parentRuntime, undefined, `runtime overrides [${parentRuntime}]`);
  }

  await checkReadFirst(push, root, mission, "");
  await checkExpectedOutputs(push, mission.expected_outputs.files, parentWriteRoots, "");
  await checkConstraints(push, root, mission.constraints, parentWriteRoots, "");
  await checkGrounding(push, root, mission, "");

  if (mission.shape === "team" && mission.team) {
    const parentOverrides = mission.runtime_config_overrides ?? {};
    for (const worker of mission.team.workers) {
      const workerLabel = `worker ${worker.role}`;
      let workerPacket: MissionDocument | undefined;
      let workerPacketPath = missionPath;
      if (worker.mission_id) {
        workerPacketPath = path.join(root, ".harness", "missions", worker.mission_id, "mission.yaml");
        try {
          workerPacket = validateMission(parseYaml(await readFile(workerPacketPath, "utf-8")));
          push("PASS", `worker packet schema [${workerLabel}]`);
        } catch (error) {
          workerPacket = undefined;
          push("FAIL", `worker packet schema [${workerLabel}]`, (error as Error).message);
        }
      }
      const mergedOverrides = {
        ...parentOverrides,
        ...(workerPacket?.runtime_config_overrides ?? {}),
        ...(worker.runtime_config_overrides ?? {}),
      };
      await checkRuntimeOverrides(
        push,
        root,
        workerPacket ? workerPacketPath : missionPath,
        worker.adapter,
        mergedOverrides,
        `runtime overrides [${workerLabel}]`,
      );
      if (worker.expected_outputs) {
        const workerWriteRoots = worker.guard?.write_roots ?? parentWriteRoots;
        await checkExpectedOutputs(push, worker.expected_outputs.files, workerWriteRoots, ` [${workerLabel}]`);
      }
    }
  }

  return finish(mission.id);
}

/** Render one line per check: `PASS <name>` or `FAIL <name>: <reason>`. */
export function renderMissionCheckLines(result: MissionCheckResult): string[] {
  return result.checks.map((line) =>
    line.status === "PASS"
      ? `PASS ${line.name}`
      : `FAIL ${line.name}${line.reason ? `: ${line.reason}` : ""}`,
  );
}
