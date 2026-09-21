import { assertIndependentReviewExecution } from "../harness/independent-review-execution.js";
import { prepareRuntimeResume, recoveryPrompt, persistRuntimeRecovery } from "../harness/runtime-recovery.js";
import { claimRuntimeAttempt } from "../harness/runtime-attempt.js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { relativeArtifactPath } from "../harness/artifact-paths.js";
import { parse, stringify } from "yaml";
import { z } from "zod";
import { registerRuntimeConfigSchema, type AdapterDocument } from "../schema/adapter.js";
import { validateMission } from "../schema/mission.js";
import { validateWorkflow } from "../schema/workflow.js";
import { RuntimePricingSchema, validateRuntimeResult, type RuntimeResultDocument } from "../schema/artifacts.js";
import { RuntimeLimitsSchema, RuntimeRecoveryPolicySchema, type RuntimeLimits, type RuntimeRecoveryDeadline, DEFAULT_PROTECTED_PATHS, ToolGuardArtifactSchema, type ToolGuardPolicy } from "../schema/runtime-control.js";
import { estimateConfiguredCost, type RuntimeUsage } from "../harness/usage.js";
import { runtimeRegistry, type AdapterCheckResult } from "../harness/registry.js";
import { buildDispatchContext } from "../harness/dispatch-context.js";
import { renderPrompt } from "../harness/render-prompt.js";
import { mergeRuntimeConfigOverrides } from "../harness/runtime-config-overrides.js";
import { generateRunId, appendRunsIndexEntry, writeLatestPointer, mirrorRuntimeResultToLatest } from "../harness/run-id.js";
import { runRuntimeProcess, type RuntimeProcessInput, type RuntimeProcessOutput } from "../harness/runtime-process.js";
import { nativeRuntimeCompleted, nativeRuntimeEvent, nativeRuntimeRoute, runtimeRouteMismatch, runtimeTerminalFailure } from "../harness/runtime-supervision.js";
import { resolveRuntimeCommand } from "../harness/runtime-command.js";
import { captureDiffWithUntracked } from "../harness/diff-capture.js";
import { extractRuntimeFinalMessageSentinel } from "../harness/runtime-final-message.js";
import { getMissionArtifactContext, persistPromptAndSession, appendMissionEvent, writeArtifactFile } from "./_artifact-context.js";

export const CommandCodeRuntimeConfigSchema = z.object({
  model: z.string().optional().default(""),
  cli_args: z.array(z.string()).optional().default([]),
  trust_workspace: z.boolean().optional().default(false),
  permission_mode: z.enum(["guard", "yolo", "prompt"]).optional(),
  resume_session: z.string().min(1).optional(),
  resume_from_run: z.string().min(1).optional(),
  recovery_notes: z.string().min(1).optional(),
  recovery: RuntimeRecoveryPolicySchema.optional(),
  recovery_grace: z.boolean().optional(),
  max_turns: z.number().int().positive().optional(),
  limits: RuntimeLimitsSchema.optional(),
  pricing: RuntimePricingSchema.optional(),
}).strict();
registerRuntimeConfigSchema("command-code", CommandCodeRuntimeConfigSchema);
const exec = promisify(execFile);

export type CommandCodeProbeRunner = (
  command: string,
  args: string[],
) => Promise<{ stdout: string; stderr?: string }>;

export function buildCommandCodeProbeArgs(cliArgs: string[] = []): string[] {
  return [...cliArgs, "--version", "--no-auto-update"];
}

const ANSI_CSI_REGEX = /[\u001B\u009B]\[[0-9;?]*[ -/]*[@-~]/g;

export function parseCommandCodeVersion(output: string): string | null {
  const stripped = output.replace(ANSI_CSI_REGEX, "");
  const lines = stripped.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const match = lines[i].match(/^v?(\d+\.\d+\.\d+(?:[-+a-zA-Z0-9_.]*[a-zA-Z0-9])?)$/);
    if (match) {
      return match[1];
    }
  }
  return null;
}

export async function checkCommandCode(
  manifest: AdapterDocument,
  root?: string,
  probe?: CommandCodeProbeRunner,
): Promise<AdapterCheckResult> {
  const config = CommandCodeRuntimeConfigSchema.parse(manifest.config?.runtime_config ?? {});
  try {
    const probeArgs = buildCommandCodeProbeArgs(config.cli_args);
    const executable = await resolveRuntimeCommand(manifest.config?.cli_command || "cmdc", probeArgs);
    const result = probe
      ? await probe(executable.command, executable.args)
      : await exec(executable.command, executable.args);
    const rawOutput = (result.stdout || result.stderr || "").toString();
    const version = parseCommandCodeVersion(rawOutput);
    if (!version) {
      return {
        runtime: "command-code",
        found: false,
        version: "",
        errors: ["Command Code version not found in probe output"],
      };
    }
    return { runtime: "command-code", found: true, version, errors: [] };
  } catch {
    return { runtime: "command-code", found: false, version: "", errors: ["Configured Command Code CLI could not be executed"] };
  }
}

runtimeRegistry.register("command-code", checkCommandCode);
export async function planCommandCodeRun(root: string, missionPath: string, options: { extraRuntimeConfigOverrides?: Record<string, unknown>; artifactRoot?: string } = {}) {
  const mission = validateMission(parse(await readFile(missionPath, "utf8")));
  const adapter = (await runtimeRegistry.load(root, "command-code")).document;
  const config = CommandCodeRuntimeConfigSchema.parse({ ...adapter.config?.runtime_config,
    ...mergeRuntimeConfigOverrides(mission, options.extraRuntimeConfigOverrides) });
  const cliCommand = adapter.config?.cli_command || "cmdc";
  if (!config.model.trim()) throw new Error("Command Code requires an explicit runtime_config model");
  if (!mission.guard && config.permission_mode === undefined) {
    throw new Error("Command Code print mode requires a guard policy or runtime_config.permission_mode: \"yolo\" (or \"prompt\")");
  }
  const permissionMode = mission.guard ? "guard" as const : config.permission_mode ?? "prompt" as const;
  const reviewRequestSha256 = await assertIndependentReviewExecution(root, missionPath, mission, {
    canonicalRoot: options.artifactRoot ?? root, runtime: "command-code", model: config.model,
    resumeSession: config.resume_session, resumeFromRun: config.resume_from_run, extraArgs: config.cli_args,
  });
  if (config.resume_session && config.resume_from_run) throw new Error("Choose resume_session or resume_from_run, not both");
  const resume = config.resume_from_run
    ? await prepareRuntimeResume(options.artifactRoot ?? root, mission.id, config.resume_from_run, "command-code", config.recovery_notes ?? config.recovery?.notes ?? "")
    : undefined;
  const grace = config.recovery_grace === true || resume?.grace === true;
  const deadline = config.recovery?.on_deadline;
  const workflow = validateWorkflow(parse(await readFile(path.join(root, ".harness", "workflows", `${mission.workflow_profile}.yaml`), "utf8")));
  const prompt = renderPrompt(buildDispatchContext(mission, workflow)) + (resume ? recoveryPrompt(resume) : "");
  // Preserve native sessions; authorization remains with the configured CLI and sandbox.
  const args = [...config.cli_args, "-p", prompt];
  const resumeSession = resume?.sessionId ?? config.resume_session;
  if (resumeSession) args.push("--resume", resumeSession);
  args.push("-m", config.model, "--verbose", "--skip-onboarding", "--no-auto-update", "--no-skills", "--output-format", "json");
  if (permissionMode === "guard" || permissionMode === "yolo") args.push("--yolo");
  const effectiveMaxTurns = grace && deadline ? deadline.grace_turns + 1 : config.max_turns;
  if (effectiveMaxTurns) args.push("--max-turns", String(effectiveMaxTurns));
  return { command: cliCommand, args, prompt, mission, config, resume,
    grace, deadline,
    permission_mode: permissionMode,
    ...(mission.guard ? { guard: mission.guard as ToolGuardPolicy } : {}),
    expectedRoute: { model: config.model }, reviewRequestSha256, worktree: false, session_id_passthrough: false, errors: [] as string[] };
}

export async function dryRunCommandCode(root: string, missionPath: string) {
  const plan = await planCommandCodeRun(root, missionPath);
  const artifacts = await getMissionArtifactContext(root, missionPath, generateRunId());
  if (artifacts) await persistPromptAndSession(artifacts, plan.prompt, {
    schema_version: "uh.runtime-session.v0", mission_id: plan.mission.id, runtime: "command-code",
    status: "planned", command: plan.command, args: plan.args,
  });
  return plan;
}

export interface CommandCodeRunOptions {
  runner?: (input: RuntimeProcessInput) => Promise<RuntimeProcessOutput>;
  collectDiff?: (cwd: string) => Promise<{ patch: string; errors?: string[] }>;
  runId?: string;
  artifactRoot?: string;
  timeoutMs?: number;
  cancellationSignal?: AbortSignal;
  extraRuntimeConfigOverrides?: Record<string, unknown>;
  limits?: RuntimeLimits;
}

export async function runCommandCode(root: string, missionPath: string, options: CommandCodeRunOptions = {}) {
  const plan = await planCommandCodeRun(root, missionPath, options);
  const runId = options.runId ?? generateRunId();
  const canonical = options.artifactRoot ?? root;
  const artifacts = await getMissionArtifactContext(canonical, path.join(canonical, ".harness", "missions", plan.mission.id, "mission.yaml"), runId);
  if (!artifacts) throw new Error("Command Code requires a canonical UH mission artifact directory");
  await claimRuntimeAttempt(artifacts);
  if (plan.resume) await persistRuntimeRecovery(artifacts, plan.resume);
  const startedAt = new Date().toISOString();
  await persistPromptAndSession(artifacts, plan.prompt, {
    schema_version: "uh.runtime-session.v0", mission_id: plan.mission.id, runtime: "command-code",
    status: "running", command: plan.command, args: plan.args, started_at: startedAt,
    ...(plan.config.pricing ? { pricing: plan.config.pricing } : {}),
  });
  await appendRunsIndexEntry(canonical, plan.mission.id, { run_id: runId, started_at: startedAt, status: "running", runtime: "command-code", replay_of: plan.resume?.sourceRunId });
  await writeLatestPointer(canonical, plan.mission.id, { schema_version: "uh.latest-run.v0", run_id: runId, started_at: startedAt, status: "running" });
  await appendMissionEvent(artifacts, { event: "runtime.started", runtime: "command-code", mission_id: plan.mission.id, run_id: runId, timestamp: startedAt });
  let guardEnv: NodeJS.ProcessEnv | undefined;
  if (plan.guard) {
    const effectiveLimits = { ...plan.config.limits, ...options.limits };
    const protectedPaths = effectiveLimits.protected_paths ?? DEFAULT_PROTECTED_PATHS;
    const artifact = ToolGuardArtifactSchema.parse({
      schema_version: "uh.tool-guard.v0",
      ...plan.guard,
      worker_root: root,
      protected_paths: protectedPaths,
    });
    const policyPath = path.join(artifacts.runDir, "tool-guard.json");
    const logPath = path.join(artifacts.runDir, "tool-guard.log");
    await writeArtifactFile(artifacts.missionDir, policyPath, JSON.stringify(artifact, null, 2));
    const settingsPath = path.join(root, ".commandcode", "settings.json");
    await mkdir(path.dirname(settingsPath), { recursive: true });
    let settings: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(await readFile(settingsPath, "utf8")) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) settings = parsed as Record<string, unknown>;
    } catch { /* absent or malformed settings are replaced with a valid hook container */ }
    const hooks = settings.hooks && typeof settings.hooks === "object" && !Array.isArray(settings.hooks)
      ? settings.hooks as Record<string, unknown> : {};
    const preToolUse = Array.isArray(hooks.PreToolUse) ? hooks.PreToolUse : [];
    const hookPath = process.env.UH_HARNESS_DIST
      ? path.join(process.env.UH_HARNESS_DIST, "extensions", "tool-guard", "cmdc-hook.js")
      : fileURLToPath(new URL("../../dist/extensions/tool-guard/cmdc-hook.js", import.meta.url));
    const retainedHooks = preToolUse.filter((entry) => {
      if (!entry || typeof entry !== "object" || !Array.isArray((entry as Record<string, unknown>).hooks)) return true;
      const nested = (entry as Record<string, unknown>).hooks as unknown[];
      return !nested.some((hook: unknown) => typeof hook === "object" && hook !== null && String((hook as Record<string, unknown>).command ?? "").includes("tool-guard"));
    });
    hooks.PreToolUse = [...retainedHooks, { hooks: [{ type: "command", command: `${process.execPath} \"${hookPath}\"`, timeout: 10 }] }];
    settings.hooks = hooks;
    await writeFile(settingsPath, JSON.stringify(settings, null, 2), "utf8");
    await writeFile(path.join(root, ".commandcode", ".gitignore"), "*\n", "utf8");
    guardEnv = { ...process.env, UH_TOOL_GUARD_POLICY: policyPath, UH_TOOL_GUARD_LOG: logPath };
  }
  let partial = "";
  const events: Record<string, unknown>[] = [];
  const observe = async (chunk: string) => {
    partial += chunk;
    const lines = partial.split(/\r?\n/);
    partial = lines.pop() ?? "";
    for (const line of lines) {
      let event;
      try { event = nativeRuntimeEvent(JSON.parse(line)); } catch { continue; }
      if (!event) continue;
      events.push(event);
      await appendMissionEvent(artifacts, { ...event, event: `command-code.${event.type}`, timestamp: new Date().toISOString() });
    }
  };
  let output: RuntimeProcessOutput;
  try {
    output = await (options.runner ?? runRuntimeProcess)({ command: plan.command, args: plan.args, cwd: root,
      env: guardEnv,
      permissionMode: plan.permission_mode,
      guardLogPath: plan.guard && artifacts ? path.join(artifacts.runDir, "tool-guard.log") : undefined,
      timeoutMs: options.timeoutMs,
      onDeadline: plan.grace ? undefined : plan.deadline,
      cancellationSignal: options.cancellationSignal,
      expectedRoute: plan.expectedRoute,
      reviewRequestSha256: plan.reviewRequestSha256,
      limits: { ...plan.config.limits, ...(plan.config.max_turns ? { max_turns: plan.config.max_turns } : {}),
        ...(plan.grace && plan.deadline ? { max_turns: plan.deadline.grace_turns + 1, timeout_ms: plan.deadline.grace_timeout_ms } : {}), ...options.limits },
      artifacts: { directory: artifacts.runDir, missionId: plan.mission.id, runId, runtime: "command-code" }, onStdoutChunk: observe });
    if (events.length === 0 && output.stdout) { partial = ""; await observe(output.stdout); }
    if (partial.trim()) await observe("\n");
  } catch (error) {
    output = { stdout: "", stderr: "", exitCode: 1, timedOut: false, spawnError: (error as Error).message };
  }
  const terminal = events.filter(e => e.type === "result" || e.type === "run_end").at(-1);
  const nativeResult = terminal?.result && typeof terminal.result === "object" ? terminal.result as Record<string, unknown> : terminal;
  const text = typeof nativeResult?.finalText === "string" ? nativeResult.finalText : "";
  const finalMessage = extractRuntimeFinalMessageSentinel(text) ?? text;
  const observedModels = new Set<string>();
  for (const event of events) {
    const model = nativeRuntimeRoute(event)?.model;
    if (model) observedModels.add(model);
  }
  const observedModel = observedModels.size === 1 ? observedModels.values().next().value : undefined;
  const slash = typeof observedModel === "string" ? observedModel.indexOf("/") : -1;
  const reportedProvider = typeof observedModel === "string" && slash > 0 ? observedModel.slice(0, slash) : undefined;
  const reportedModel = typeof observedModel === "string" ? (slash > 0 ? observedModel.slice(slash + 1) : observedModel) : undefined;
  const usageRecords = output.outputTruncated || !terminal ? [] : nativeResult?.usage ? [nativeResult.usage] : events.filter(e => e.type === "turn_end").map(e => e.usage);
  const usage: RuntimeUsage = { source: "runtime" };
  const fields = { inputTokens: "input_tokens", outputTokens: "output_tokens", totalTokens: "total_tokens", cacheReadTokens: "cache_read_tokens", cacheWriteTokens: "cache_write_tokens" } as const;
  for (const [native, canonical] of Object.entries(fields)) {
    let total = 0;
    let complete = usageRecords.length > 0;
    for (const record of usageRecords) {
      const value = record && typeof record === "object" ? record as Record<string, unknown> : {};
      const count = value[native] ?? value[canonical];
      if (typeof count !== "number" || !Number.isFinite(count) || count < 0) { complete = false; break; }
      total += count;
    }
    if (complete) usage[canonical] = total;
  }
  if (reportedProvider) usage.provider = reportedProvider;
  if (reportedModel) usage.model = reportedModel;
  const runtimeCost = nativeResult?.usage && typeof nativeResult.usage === "object"
    ? (nativeResult.usage as Record<string, unknown>).cost_usd : undefined;
  if (typeof runtimeCost === "number" && Number.isFinite(runtimeCost) && runtimeCost >= 0) {
    usage.cost_usd = runtimeCost;
    usage.cost_basis = "provider_reported";
  }
  const estimatedCost = usage.cost_usd === undefined ? estimateConfiguredCost(usage, observedModel, plan.config.pricing) : undefined;
  if (estimatedCost !== undefined) {
    usage.cost_usd = estimatedCost;
    usage.cost_basis = "configured_estimate";
  }
  const facts = {
    ...(reportedProvider ? { provider: reportedProvider } : {}),
    ...(reportedModel ? { model: reportedModel } : {}),
    ...(Object.keys(usage).length > 1 ? { usage } : {}),
    ...(plan.config.pricing ? { pricing: plan.config.pricing } : {}),
    ...(usage.cost_usd !== undefined ? { cost_usd: usage.cost_usd, cost_basis: usage.cost_basis } : {}),
  };
  const errors = [output.spawnError, ...events.filter(e => e.type === "result" || e.type === "run_end").map(runtimeTerminalFailure)].filter((e): e is string => Boolean(e));
  if (events.some(event => runtimeRouteMismatch(nativeRuntimeRoute(event), plan.expectedRoute))) errors.push("Runtime reported a route outside the configured assignment");
  if (!reportedModel) errors.push("Runtime did not attest the configured route");
  if (!terminal) errors.push("Command Code did not emit a terminal result");
  let diff = { patch: "", errors: [] as string[] };
  try {
    const captured = await (options.collectDiff ?? captureDiffWithUntracked)(root);
    diff = { patch: captured.patch, errors: captured.errors ?? [] };
  } catch (error) { diff.errors.push(`Diff capture failed: ${(error as Error).message}`); }
  errors.push(...diff.errors);
  const nativeCompleted = nativeRuntimeCompleted({
    nativeTerminal: output.nativeTerminal === true,
    nativeTerminalFailure: terminal ? runtimeTerminalFailure(terminal) : "Command Code did not emit a terminal result",
    supervisionStopCode: output.supervisionStopCode,
    finalMessage,
    cancelled: output.cancelled,
    timedOut: output.timedOut,
    spawnError: output.spawnError,
    errors,
  });
  const status = output.cancelled ? "cancelled" : nativeCompleted ? "passed"
    : output.exitCode !== 0 || output.timedOut || errors.length ? "failed" : finalMessage ? "passed" : "blocked";
  const incomplete = plan.grace || output.supervisionStopCode === "deadline";
  const incompleteReason = incomplete
    ? (output.supervisionStopCode === "deadline" ? "Deadline grace budget exhausted" : "Original runtime budget exhausted; deliverable captured during grace")
    : undefined;
  const finishedAt = new Date().toISOString();
  const result: RuntimeResultDocument = validateRuntimeResult({ schema_version: "uh.runtime-result.v0",
    mission_id: plan.mission.id, runtime: "command-code", status, started_at: startedAt, finished_at: finishedAt,
    ...(incomplete ? { completion: "incomplete" as const, incomplete_reason: incompleteReason } : {}),
    exit_code: status === "failed" && output.exitCode === 0 ? 1 : output.exitCode,
    ...(status === "passed" && output.exitCode !== 0 ? { exit_code_ignored_reason: "runtime exited non-zero after completed native terminal event" as const } : {}),
    prompt_path: relativeArtifactPath(canonical, artifacts.promptPath),
    stdout_path: relativeArtifactPath(canonical, artifacts.stdoutPath), stderr_path: relativeArtifactPath(canonical, artifacts.stderrPath),
    diff_path: relativeArtifactPath(canonical, artifacts.diffPath), errors, ...facts });
  await writeArtifactFile(artifacts.missionDir, artifacts.stdoutPath, output.stdout);
  await writeArtifactFile(artifacts.missionDir, artifacts.stderrPath, output.stderr);
  await writeArtifactFile(artifacts.missionDir, artifacts.diffPath, diff.patch);
  await writeArtifactFile(artifacts.missionDir, artifacts.finalMessagePath, finalMessage);
  await writeArtifactFile(artifacts.missionDir, artifacts.runtimeResultPath, stringify(result));
  await writeArtifactFile(artifacts.missionDir, artifacts.runtimeSessionPath, stringify({ schema_version: "uh.runtime-session.v0",
    mission_id: plan.mission.id, runtime: "command-code", status: status === "passed" ? "succeeded" : "failed",
    command: plan.command, args: plan.args, started_at: startedAt, finished_at: finishedAt, exit_code: result.exit_code, ...facts }));
  await appendMissionEvent(artifacts, { event: "runtime.finished", runtime: "command-code", mission_id: plan.mission.id, run_id: runId, status, timestamp: finishedAt });
  await appendRunsIndexEntry(canonical, plan.mission.id, { run_id: runId, started_at: startedAt, finished_at: finishedAt, status, runtime: "command-code" });
  await writeLatestPointer(canonical, plan.mission.id, { schema_version: "uh.latest-run.v0", run_id: runId, started_at: startedAt, finished_at: finishedAt, status });
  await mirrorRuntimeResultToLatest(canonical, plan.mission.id, runId);
  return { exitCode: result.exit_code ?? 1, stdout: output.stdout, stderr: output.stderr, result, runId };
}
