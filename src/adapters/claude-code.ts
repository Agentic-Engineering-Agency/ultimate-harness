import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import { parse, stringify } from "yaml";
import { z } from "zod";
import { registerRuntimeConfigSchema } from "../schema/adapter.js";
import { validateMission, type MissionDocument } from "../schema/mission.js";
import { validateWorkflow } from "../schema/workflow.js";
import { RuntimePricingSchema, validateRuntimeResult, type RuntimeResultDocument } from "../schema/artifacts.js";
import {
  DEFAULT_PROTECTED_PATHS,
  resolveToolGuardPolicy,
  RuntimeLimitsSchema,
  RuntimeRecoveryDeadlineSchema,
  RuntimeRecoveryPolicySchema,
  ToolGuardArtifactSchema,
  type RuntimeLimits,
  type ToolGuardPolicy,
} from "../schema/runtime-control.js";
import { aggregateRuntimeUsage, estimateConfiguredCost, usageFromAnthropic, type RuntimeUsage } from "../harness/usage.js";
import { assertIndependentReviewExecution } from "../harness/independent-review-execution.js";
import { claimRuntimeAttempt } from "../harness/runtime-attempt.js";
import { prepareRuntimeResume, persistRuntimeRecovery, recoveryPrompt, type RuntimeResume } from "../harness/runtime-recovery.js";
import { buildDispatchContext } from "../harness/dispatch-context.js";
import { renderPrompt } from "../harness/render-prompt.js";
import { mergeRuntimeConfigOverrides } from "../harness/runtime-config-overrides.js";
import { runtimeRegistry } from "../harness/registry.js";
import { resolveRuntimeCommand } from "../harness/runtime-command.js";
import { runRuntimeProcess, type RuntimeProcessInput, type RuntimeProcessOutput } from "../harness/runtime-process.js";
import { snapshotGuardHook } from "../harness/runtime-snapshot.js";
import { armGuard, guardArmStopReceipt, GUARD_ARM_LOG_NAME, type GuardArmingFailure, type GuardArmingInput, type GuardArmingResult } from "../harness/guard-arming.js";
import {
  nativeRuntimeCompleted,
  nativeRuntimeEvent,
  nativeRuntimeRoute,
  runtimeRouteMismatch,
  runtimeTerminalFailure,
} from "../harness/runtime-supervision.js";
import { captureDiffWithUntracked, diffCaptureFailureRecord } from "../harness/diff-capture.js";
import { extractRuntimeFinalMessageSentinel } from "../harness/runtime-final-message.js";
import { relativeArtifactPath } from "../harness/artifact-paths.js";
import { appendRunsIndexEntry, generateRunId, mirrorRuntimeResultToLatest, writeLatestPointer } from "../harness/run-id.js";
import {
  appendMissionEvent,
  getMissionArtifactContext,
  persistPromptAndSession,
  writeArtifactFile,
} from "./_artifact-context.js";

const exec = promisify(execFile);
export const DEFAULT_CLAUDE_CODE_MODEL = "claude-fable-5-1[1m]";
const RESERVED_CLAUDE_FLAGS = new Set([
  "-p", "--print", "--model", "--output-format", "--verbose", "--include-partial-messages",
  "--permission-mode", "--settings", "--resume", "-r", "--continue", "-c", "--bare",
  "--dangerously-skip-permissions", "--allow-dangerously-skip-permissions", "--allowedtools", "--allowed-tools",
]);

export const ClaudeCodeRuntimeConfigSchema = z.object({
  model: z.string().min(1).default(DEFAULT_CLAUDE_CODE_MODEL),
  cli_args: z.array(z.string()).default([]),
  role: z.enum(["worker", "orchestrator"]).default("worker"),
  effort: z.enum(["low", "medium", "high", "xhigh", "max", "ultracode"]).optional(),
  permission_mode: z.enum(["default", "acceptEdits", "plan", "auto", "dontAsk", "manual"]).default("default"),
  resume_session: z.string().min(1).optional(),
  resume_from_run: z.string().min(1).optional(),
  recovery_notes: z.string().min(1).optional(),
  recovery: RuntimeRecoveryPolicySchema.optional(),
  recovery_grace: z.boolean().default(false),
  max_turns: z.number().int().positive().optional(),
  limits: RuntimeLimitsSchema.optional(),
  pricing: RuntimePricingSchema.optional(),
}).strict().superRefine((config, ctx) => {
  for (const arg of config.cli_args) {
    const flag = arg.split("=", 1)[0].toLowerCase();
    if (RESERVED_CLAUDE_FLAGS.has(flag) || flag === "--permission-prompts" || flag === "--max-turns") {
      ctx.addIssue({ code: "custom", path: ["cli_args"], message: `Claude Code flag ${arg} is controlled by UH` });
    }
  }
  if (config.permission_mode === "dontAsk" && config.role === "worker") {
    ctx.addIssue({ code: "custom", path: ["permission_mode"], message: "Claude Code workers may not suppress permission prompts" });
  }
});
export type ClaudeCodeRuntimeConfig = z.infer<typeof ClaudeCodeRuntimeConfigSchema>;
export type ClaudeCodeRole = ClaudeCodeRuntimeConfig["role"];
type ClaudeCodeDeadline = z.infer<typeof RuntimeRecoveryDeadlineSchema>;
registerRuntimeConfigSchema("claude-code", ClaudeCodeRuntimeConfigSchema);

runtimeRegistry.register("claude-code", async (manifest) => {
  const config = ClaudeCodeRuntimeConfigSchema.parse(manifest.config?.runtime_config);
  try {
    const executable = await resolveRuntimeCommand(manifest.config?.cli_command || "claude", [...config.cli_args, "--version"]);
    const result = await exec(executable.command, executable.args);
    return { runtime: "claude-code", found: true, version: result.stdout.trim() || result.stderr.trim(), errors: [] };
  } catch {
    return { runtime: "claude-code", found: false, version: "", errors: ["Configured Claude Code CLI could not be executed"] };
  }
});

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

export interface ClaudeCodeResultFacts {
  finalText: string;
  usage?: RuntimeUsage;
  costUsd?: number;
  costBasis?: "runtime_estimate";
  permissionDenials: string[];
}

export function parseClaudeCodeResult(event: Record<string, unknown>, model?: string): ClaudeCodeResultFacts {
  const result = record(event.result);
  const finalText = typeof event.result === "string"
    ? event.result
    : typeof result?.result === "string" ? result.result
      : typeof result?.finalText === "string" ? result.finalText : "";
  const modelUsage = record(event.modelUsage);
  const usageEntry = model && modelUsage?.[model] ? record(modelUsage[model])
    : modelUsage ? Object.values(modelUsage).map(record).find((entry): entry is Record<string, unknown> => Boolean(entry)) : undefined;
  const usage = usageEntry ? usageFromAnthropic({
    input_tokens: usageEntry.inputTokens ?? usageEntry.input_tokens,
    output_tokens: usageEntry.outputTokens ?? usageEntry.output_tokens,
    cache_read_input_tokens: usageEntry.cacheReadInputTokens ?? usageEntry.cache_read_input_tokens,
    cache_creation_input_tokens: usageEntry.cacheCreationInputTokens ?? usageEntry.cache_write_input_tokens,
  }, model) ?? undefined : undefined;
  const entryCost = usageEntry?.costUSD ?? usageEntry?.cost_usd;
  const totalCost = entryCost ?? event.total_cost_usd;
  const costUsd = numberValue(totalCost);
  if (usage && costUsd !== undefined) {
    usage.cost_usd = costUsd;
    usage.cost_basis = "runtime_estimate";
  }
  const denials = Array.isArray(event.permission_denials) ? event.permission_denials
    .map(record)
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .map(entry => typeof entry.tool_name === "string" ? entry.tool_name : "unknown") : [];
  return { finalText, ...(usage ? { usage } : {}), ...(costUsd !== undefined ? { costUsd, costBasis: "runtime_estimate" as const } : {}), permissionDenials: denials };
}

function streamedClaudeUsage(events: Record<string, unknown>[], model?: string): RuntimeUsage | undefined {
  const messages = new Map<string, { usage: Record<string, unknown>; complete: boolean }>();
  let active: string | undefined;
  for (const event of events) {
    if (event.type === "message_start") {
      const message = record(event.message);
      active = typeof message?.id === "string" ? message.id : undefined;
      if (active && !messages.has(active)) {
        messages.set(active, { usage: { ...record(message?.usage) }, complete: false });
      }
    } else if (event.type === "message_delta" && active) {
      const message = messages.get(active);
      if (message && !message.complete) Object.assign(message.usage, record(event.usage));
    } else if (event.type === "message_stop" && active) {
      const message = messages.get(active);
      if (message) message.complete = true;
      active = undefined;
    }
  }
  return aggregateRuntimeUsage([...messages.values()].map(message => {
    const usage = usageFromAnthropic(message.usage, model);
    if (!usage) return undefined;
    if (!message.complete) {
      delete usage.output_tokens;
      delete usage.total_tokens;
    }
    return { model, usage };
  })).usage;
}

/**
 * Native write rules for the orchestrator role, derived exactly from the resolved
 * guard's write roots so print mode can settle a report without a prompt nobody
 * answers. A root that covers the worker root or escapes it cannot be narrowed to
 * a sandbox, so planning refuses instead of granting repository-wide writes. The
 * UH guard hook still judges every call: these rules only stop the native denial
 * that would otherwise precede it.
 */
function orchestratorWriteRules(roots: string[]): string[] {
  const patterns = roots.map(root => {
    const slashed = root.replaceAll("\\", "/");
    const segments = slashed.split("/").filter(segment => segment !== "" && segment !== ".");
    if (slashed.startsWith("/") || /^[a-zA-Z]:/.test(slashed) || segments.includes("..")) {
      throw new Error(`Claude Code orchestrator guard write root "${root}" is outside the mission checkout; declare roots inside the worker root`);
    }
    if (segments.length === 0) {
      throw new Error(`Claude Code orchestrator guard write root "${root}" covers the whole repository; declare the roots the orchestrator writes, for example [out]`);
    }
    return `${segments.join("/")}/**`;
  });
  return [...new Set(patterns)];
}

function claudeSettings(role: ClaudeCodeRole, hookPath: string, writeRules: string[]): string {
  const settings: Record<string, unknown> = {
    hooks: {
      PreToolUse: [{ matcher: "*", hooks: [{ type: "command", command: `${JSON.stringify(process.execPath)} ${JSON.stringify(hookPath)}`, timeout: 10 }] }],
    },
  };
  if (role === "orchestrator") {
    settings.permissions = {
      allow: [
        "Bash(uh *)", "Bash(node *dist/cli.js*)",
        ...writeRules.flatMap(rule => [`Write(${rule})`, `Edit(${rule})`]),
      ],
    };
  }
  return JSON.stringify(settings);
}

function controllerGuard(guard: ToolGuardPolicy | undefined): ToolGuardPolicy & { controller_commands: boolean } {
  return { ...(guard ?? resolveToolGuardPolicy(undefined)), controller_commands: true };
}

export interface ClaudeCodeRunPlan {
  command: string;
  args: string[];
  prompt: string;
  mission: MissionDocument;
  config: ClaudeCodeRuntimeConfig;
  resume?: RuntimeResume;
  grace: boolean;
  deadline?: ClaudeCodeDeadline;
  permission_mode: "guard" | "prompt";
  guard: (ToolGuardPolicy & { controller_commands?: boolean }) | undefined;
  expectedRoute: { model: string };
  reviewRequestSha256?: string;
  worktree: false;
  session_id_passthrough: false;
  errors: string[];
}

export async function planClaudeCodeRun(root: string, missionPath: string, options: { extraRuntimeConfigOverrides?: Record<string, unknown>; artifactRoot?: string } = {}): Promise<ClaudeCodeRunPlan> {
  const mission = validateMission(parse(await readFile(missionPath, "utf8")));
  const adapter = (await runtimeRegistry.load(root, "claude-code")).document;
  const config = ClaudeCodeRuntimeConfigSchema.parse({
    ...adapter.config?.runtime_config,
    ...mergeRuntimeConfigOverrides(mission, options.extraRuntimeConfigOverrides),
  });
  if (config.resume_session && config.resume_from_run) throw new Error("Choose resume_session or resume_from_run, not both");
  if (config.role === "worker" && !mission.guard) throw new Error("Claude Code worker runs require a mission guard policy");
  if (config.role === "worker" && config.permission_mode !== "default") throw new Error("Claude Code worker runs require permission_mode default");
  if (config.role === "orchestrator" && !mission.guard) throw new Error("Claude Code orchestrator runs require a mission guard policy");
  const reviewRequestSha256 = await assertIndependentReviewExecution(root, missionPath, mission, {
    canonicalRoot: options.artifactRoot ?? root,
    runtime: "claude-code",
    model: config.model,
    resumeSession: config.resume_session,
    resumeFromRun: config.resume_from_run,
    extraArgs: config.cli_args,
  });
  const resume = config.resume_from_run
    ? await prepareRuntimeResume(options.artifactRoot ?? root, mission.id, config.resume_from_run, "claude-code", config.recovery_notes ?? config.recovery?.notes ?? "")
    : undefined;
  const grace = config.recovery_grace || resume?.grace === true;
  const deadline = config.recovery?.on_deadline;
  const workflow = validateWorkflow(parse(await readFile(path.join(root, ".harness", "workflows", `${mission.workflow_profile}.yaml`), "utf8")));
  const prompt = renderPrompt(buildDispatchContext(mission, workflow)) + (resume ? recoveryPrompt(resume) : "");
  const orchestratorGuard = config.role === "orchestrator" ? controllerGuard(mission.guard) : undefined;
  const guard = orchestratorGuard ?? mission.guard;
  const writeRules = orchestratorGuard ? orchestratorWriteRules(orchestratorGuard.write_roots) : [];
  const args = [...config.cli_args, "-p", prompt];
  const resumeSession = resume?.sessionId ?? config.resume_session;
  if (resumeSession) args.push("--resume", resumeSession);
  args.push("--model", config.model, "--output-format", "stream-json", "--verbose", "--include-partial-messages", "--permission-mode", config.permission_mode);
  if (config.role === "orchestrator") {
    args.push("--tools", "Bash,Read,Write,Edit", "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}');
  }
  if (config.effort) args.push("--effort", config.effort);
  // Turn-cap precedence mirrors command-code: top-level max_turns wins, else limits.max_turns.
  const effectiveMaxTurns = grace && deadline ? deadline.grace_turns + 1 : (config.max_turns ?? config.limits?.max_turns);
  if (effectiveMaxTurns) args.push("--max-turns", String(effectiveMaxTurns));
  if (guard) args.push("--settings", claudeSettings(config.role, await snapshotGuardHook("extensions/tool-guard/claude-code-hook.js"), writeRules));
  return {
    command: adapter.config?.cli_command || "claude",
    args,
    prompt,
    mission,
    config,
    resume,
    grace,
    deadline,
    permission_mode: guard ? "guard" : "prompt",
    guard,
    expectedRoute: { model: config.model },
    reviewRequestSha256,
    worktree: false,
    session_id_passthrough: false,
    errors: [],
  };
}

export async function dryRunClaudeCode(root: string, missionPath: string, options: { extraRuntimeConfigOverrides?: Record<string, unknown> } = {}): Promise<ClaudeCodeRunPlan> {
  const plan = await planClaudeCodeRun(root, missionPath, options);
  const artifacts = await getMissionArtifactContext(root, missionPath, generateRunId());
  if (artifacts) await persistPromptAndSession(artifacts, plan.prompt, {
    schema_version: "uh.runtime-session.v0",
    mission_id: plan.mission.id,
    runtime: "claude-code",
    status: "planned",
    command: plan.command,
    args: plan.args,
  });
  return plan;
}

export interface ClaudeCodeRunOptions {
  runner?: (input: RuntimeProcessInput) => Promise<RuntimeProcessOutput>;
  collectDiff?: (cwd: string) => Promise<{ patch: string; errors?: string[] }>;
  /** Pre-launch guard arming seam; defaults to the real arming check. */
  armGuard?: (input: GuardArmingInput) => Promise<GuardArmingResult>;
  runId?: string;
  artifactRoot?: string;
  timeoutMs?: number;
  cancellationSignal?: AbortSignal;
  extraRuntimeConfigOverrides?: Record<string, unknown>;
  limits?: RuntimeLimits;
}

export async function runClaudeCode(root: string, missionPath: string, options: ClaudeCodeRunOptions = {}) {
  const plan = await planClaudeCodeRun(root, missionPath, options);
  const runId = options.runId ?? generateRunId();
  const canonical = options.artifactRoot ?? root;
  const artifacts = await getMissionArtifactContext(canonical, path.join(canonical, ".harness", "missions", plan.mission.id, "mission.yaml"), runId);
  if (!artifacts) throw new Error("Claude Code requires a canonical UH mission artifact directory");
  await claimRuntimeAttempt(artifacts);
  if (plan.resume) await persistRuntimeRecovery(artifacts, plan.resume);
  const startedAt = new Date().toISOString();
  await persistPromptAndSession(artifacts, plan.prompt, {
    schema_version: "uh.runtime-session.v0",
    mission_id: plan.mission.id,
    runtime: "claude-code",
    status: "running",
    command: plan.command,
    args: plan.args,
    started_at: startedAt,
    ...(plan.config.pricing ? { pricing: plan.config.pricing } : {}),
  });
  await appendRunsIndexEntry(canonical, plan.mission.id, { run_id: runId, started_at: startedAt, status: "running", runtime: "claude-code", replay_of: plan.resume?.sourceRunId });
  await writeLatestPointer(canonical, plan.mission.id, { schema_version: "uh.latest-run.v0", run_id: runId, started_at: startedAt, status: "running" });
  await appendMissionEvent(artifacts, { event: "runtime.started", runtime: "claude-code", mission_id: plan.mission.id, run_id: runId, timestamp: startedAt });

  let guardEnv: NodeJS.ProcessEnv | undefined;
  let guardArmFailure: GuardArmingFailure | undefined;
  if (plan.guard) {
    const effectiveLimits = { ...plan.config.limits, ...(plan.config.max_turns ? { max_turns: plan.config.max_turns } : {}), ...options.limits };
    const protectedPaths = effectiveLimits.protected_paths ?? DEFAULT_PROTECTED_PATHS;
    const artifact = ToolGuardArtifactSchema.parse({
      schema_version: "uh.tool-guard.v0",
      ...plan.guard,
      worker_root: root,
      protected_paths: protectedPaths,
      controller_commands: plan.config.role === "orchestrator",
    });
    const policyPath = path.join(artifacts.runDir, "tool-guard.json");
    const logPath = path.join(artifacts.runDir, "tool-guard.log");
    await writeArtifactFile(artifacts.missionDir, policyPath, JSON.stringify(artifact, null, 2));
    guardEnv = { ...process.env, UH_TOOL_GUARD_POLICY: policyPath, UH_TOOL_GUARD_LOG: logPath };
    const arming = await (options.armGuard ?? armGuard)({
      runtime: "claude-code",
      policyPath,
      logPath: path.join(artifacts.runDir, GUARD_ARM_LOG_NAME),
      hookCommand: [process.execPath, await snapshotGuardHook("extensions/tool-guard/claude-code-hook.js")],
    });
    if (!arming.ok) guardArmFailure = arming;
  }

  let partial = "";
  const events: Record<string, unknown>[] = [];
  let liveUsage: RuntimeUsage | undefined;
  const observe = async (chunk: string): Promise<void> => {
    partial += chunk;
    const lines = partial.split(/\r?\n/);
    partial = lines.pop() ?? "";
    for (const line of lines) {
      let event: Record<string, unknown> | undefined;
      try { event = nativeRuntimeEvent(JSON.parse(line)); } catch { continue; }
      if (!event) continue;
      events.push(event);
      if (event.type === "message_start" || event.type === "message_delta" || event.type === "message_stop") {
        liveUsage = streamedClaudeUsage(events, plan.config.model);
      } else if (event.type === "result") {
        liveUsage = parseClaudeCodeResult(event, plan.config.model).usage ?? liveUsage;
      }
      await appendMissionEvent(artifacts, { ...event, event: `claude-code.${event.type}`, timestamp: new Date().toISOString() });
    }
  };

  let output: RuntimeProcessOutput;
  if (guardArmFailure) {
    await writeArtifactFile(artifacts.missionDir, path.join(artifacts.runDir, "runtime-control.json"), JSON.stringify(guardArmStopReceipt({ missionId: plan.mission.id, runId, runtime: "claude-code", reason: guardArmFailure.reason }), null, 2));
    output = { stdout: "", stderr: "", exitCode: 1, timedOut: false, spawnError: guardArmFailure.reason, supervisionStopCode: "policy" };
  } else try {
    output = await (options.runner ?? runRuntimeProcess)({
      command: plan.command,
      args: plan.args,
      cwd: root,
      env: guardEnv,
      permissionMode: plan.permission_mode,
      guardLogPath: path.join(artifacts.runDir, "tool-guard.log"),
      timeoutMs: options.timeoutMs,
      onDeadline: plan.grace ? undefined : plan.deadline,
      cancellationSignal: options.cancellationSignal,
      expectedRoute: plan.expectedRoute,
      reviewRequestSha256: plan.reviewRequestSha256,
      limits: { ...plan.config.limits, ...(plan.config.max_turns ? { max_turns: plan.config.max_turns } : {}), ...(plan.grace && plan.deadline ? { max_turns: plan.deadline.grace_turns + 1, timeout_ms: plan.deadline.grace_timeout_ms } : {}), ...options.limits },
      artifacts: { directory: artifacts.runDir, missionId: plan.mission.id, runId, runtime: "claude-code" },
      onStdoutChunk: observe,
      getUsage: () => liveUsage,
    });
    if (events.length === 0 && output.stdout) { partial = ""; await observe(output.stdout); }
    if (partial.trim()) await observe("\n");
  } catch (error) {
    output = { stdout: "", stderr: "", exitCode: 1, timedOut: false, spawnError: error instanceof Error ? error.message : String(error) };
  }

  const terminal = events.filter(event => event.type === "result").at(-1);
  const observedModels = new Set<string>();
  for (const event of events) {
    const model = nativeRuntimeRoute(event)?.model;
    if (model) observedModels.add(model);
  }
  const observedModel = observedModels.size === 1 ? observedModels.values().next().value : undefined;
  const nativeFacts = terminal ? parseClaudeCodeResult(terminal, observedModel) : { finalText: "", permissionDenials: [] };
  const finalMessage = extractRuntimeFinalMessageSentinel(nativeFacts.finalText) ?? nativeFacts.finalText;
  const usage = nativeFacts.usage ?? streamedClaudeUsage(events, observedModel);
  if (usage && observedModel) usage.model = observedModel;
  const estimatedCost = usage && usage.cost_usd === undefined ? estimateConfiguredCost(usage, observedModel, plan.config.pricing) : undefined;
  if (usage && estimatedCost !== undefined) { usage.cost_usd = estimatedCost; usage.cost_basis = "configured_estimate"; }
  const reportedModel = observedModel;
  const errors = [output.spawnError, ...events.filter(event => event.type === "result").map(runtimeTerminalFailure)].filter((error): error is string => Boolean(error));
  if (events.some(event => runtimeRouteMismatch(nativeRuntimeRoute(event), plan.expectedRoute))) errors.push("Runtime reported a route outside the configured assignment");
  if (observedModels.size !== 1) errors.push("Runtime did not attest exactly one configured Claude Code model");
  if (!terminal) errors.push("Claude Code did not emit a terminal result");
  if (nativeFacts.permissionDenials.length) errors.push(`Claude Code permission denials: ${nativeFacts.permissionDenials.join(", ")}`);
  let diff = { patch: "", errors: [] as string[] };
  try {
    const captured = await (options.collectDiff ?? captureDiffWithUntracked)(root);
    diff = { patch: captured.patch, errors: captured.errors ?? [] };
  } catch (error) { diff.errors.push(`Diff capture failed: ${error instanceof Error ? error.message : String(error)}`); }
  // Diff capture runs after the runtime settled, so its failure says nothing
  // about the run itself: on a confirmed settlement it is recorded as
  // `diff_capture` bookkeeping and must not change status or exit_code. Only
  // a run that never settled may fail because of diff capture.
  const nativeCompleted = nativeRuntimeCompleted({
    nativeTerminal: output.nativeTerminal === true,
    nativeTerminalFailure: terminal ? runtimeTerminalFailure(terminal) : "Claude Code did not emit a terminal result",
    supervisionStopCode: output.supervisionStopCode,
    finalMessage,
    cancelled: output.cancelled,
    timedOut: output.timedOut,
    spawnError: output.spawnError,
    errors,
  });
  if (nativeCompleted) {
    if (diff.errors.length > 0) errors.push(diffCaptureFailureRecord(diff.errors));
  } else {
    errors.push(...diff.errors);
  }
  const status = output.cancelled ? "cancelled" : nativeCompleted ? "passed"
    : output.exitCode !== 0 || output.timedOut || errors.length ? "failed" : finalMessage ? "passed" : "blocked";
  const incomplete = plan.grace || output.supervisionStopCode === "deadline";
  const incompleteReason = incomplete
    ? output.supervisionStopCode === "deadline" ? "Deadline grace budget exhausted" : "Original runtime budget exhausted; deliverable captured during grace"
    : undefined;
  const finishedAt = new Date().toISOString();
  const facts = {
    ...(reportedModel ? { model: reportedModel } : {}),
    ...(usage ? { usage } : {}),
    ...(plan.config.pricing ? { pricing: plan.config.pricing } : {}),
    ...(usage?.cost_usd !== undefined ? { cost_usd: usage.cost_usd, cost_basis: usage.cost_basis } : {}),
  };
  const result: RuntimeResultDocument = validateRuntimeResult({
    schema_version: "uh.runtime-result.v0",
    mission_id: plan.mission.id,
    runtime: "claude-code",
    status,
    started_at: startedAt,
    finished_at: finishedAt,
    ...(incomplete ? { completion: "incomplete" as const, incomplete_reason: incompleteReason } : {}),
    exit_code: status === "failed" && output.exitCode === 0 ? 1 : output.exitCode,
    ...(status === "passed" && output.exitCode !== 0 ? { exit_code_ignored_reason: "runtime exited non-zero after completed native terminal event" as const } : {}),
    prompt_path: relativeArtifactPath(canonical, artifacts.promptPath),
    stdout_path: relativeArtifactPath(canonical, artifacts.stdoutPath),
    stderr_path: relativeArtifactPath(canonical, artifacts.stderrPath),
    diff_path: relativeArtifactPath(canonical, artifacts.diffPath),
    errors,
    ...facts,
  });
  await writeArtifactFile(artifacts.missionDir, artifacts.stdoutPath, output.stdout);
  await writeArtifactFile(artifacts.missionDir, artifacts.stderrPath, output.stderr);
  await writeArtifactFile(artifacts.missionDir, artifacts.diffPath, diff.patch);
  await writeArtifactFile(artifacts.missionDir, artifacts.finalMessagePath, finalMessage);
  await writeArtifactFile(artifacts.missionDir, artifacts.runtimeResultPath, stringify(result));
  await writeArtifactFile(artifacts.missionDir, artifacts.runtimeSessionPath, stringify({
    schema_version: "uh.runtime-session.v0",
    mission_id: plan.mission.id,
    runtime: "claude-code",
    status: status === "passed" ? "succeeded" : "failed",
    command: plan.command,
    args: plan.args,
    started_at: startedAt,
    finished_at: finishedAt,
    exit_code: result.exit_code,
    ...facts,
  }));
  await appendMissionEvent(artifacts, { event: "runtime.finished", runtime: "claude-code", mission_id: plan.mission.id, run_id: runId, status, timestamp: finishedAt });
  await appendRunsIndexEntry(canonical, plan.mission.id, { run_id: runId, started_at: startedAt, finished_at: finishedAt, status, runtime: "claude-code" });
  await writeLatestPointer(canonical, plan.mission.id, { schema_version: "uh.latest-run.v0", run_id: runId, started_at: startedAt, finished_at: finishedAt, status });
  await mirrorRuntimeResultToLatest(canonical, plan.mission.id, runId);
  return { exitCode: result.exit_code ?? 1, stdout: output.stdout, stderr: output.stderr, result, runId };
}
