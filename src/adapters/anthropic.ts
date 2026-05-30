import { z } from "zod";
import { readFile, appendFile } from "node:fs/promises";
import {
  type MissionArtifactContext,
  getMissionArtifactContext,
  writeArtifactFile,
  persistPromptAndSession,
  appendMissionEvent,
} from "./_artifact-context.js";
import { parse, stringify } from "yaml";
import path from "node:path";
import { AdapterDocument, registerRuntimeConfigSchema } from "../schema/adapter.js";
import { MissionDocument, validateMission } from "../schema/mission.js";
import { validateWorkflow, WorkflowDocument } from "../schema/workflow.js";
import { auditLog, workflowsDir } from "../harness/paths.js";
import { buildUsageEvent, estimateUsage, usageFromAnthropic } from "../harness/usage.js";
import {
  appendRunsIndexEntry,
  generateRunId,
  mirrorRuntimeResultToLatest,
  writeLatestPointer,
} from "../harness/run-id.js";
import type { RunStatus } from "../schema/runs.js";
import {
  RuntimeResultDocument,
  RuntimeResultStatus,
  validateRuntimeResult,
} from "../schema/artifacts.js";
import {
  runtimeRegistry,
  type AdapterCheckResult,
  type AdapterRuntimeChecker,
} from "../harness/registry.js";
import { captureDiffWithUntracked } from "../harness/diff-capture.js";
import { extractRuntimeFinalMessageSentinel } from "../harness/runtime-final-message.js";
import { buildDispatchContext } from "../harness/dispatch-context.js";
import { renderPrompt } from "../harness/render-prompt.js";
import { mergeRuntimeConfigOverrides } from "../harness/runtime-config-overrides.js";

/**
 * Native Anthropic runtime adapter (UH-136). Status: experimental.
 *
 * First-class HTTP client for the official pay-per-token Anthropic Messages API
 * (POST https://api.anthropic.com/v1/messages). The API key is read from the
 * ANTHROPIC_API_KEY environment variable and never stored in the manifest; when
 * it is absent the adapter check degrades gracefully (found:false) so CI can
 * skip live calls. This is distinct from the hermes-proxy (subscription
 * routing) and oh-my-pi (OMP credential store) paths — it talks directly to
 * Anthropic's metered API with your own key.
 *
 * Unlike the OpenAI-compatible openrouter adapter, the Messages API uses a
 * different request/response shape: `x-api-key` + `anthropic-version` headers,
 * a required `max_tokens`, and a `content` block array on the response. This
 * adapter maps that shape onto the same UH runtime-final + usage contract.
 */

/** Env var holding the Anthropic API key (a secret — never in the manifest). */
export const ANTHROPIC_API_KEY_ENV = "ANTHROPIC_API_KEY";
/** Default Anthropic API base URL. */
export const DEFAULT_ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1";
/** Pinned Anthropic API version header value. */
export const ANTHROPIC_VERSION = "2023-06-01";
/** Sane current default model. */
export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6";
/** Default upper bound on generated tokens (Messages API requires max_tokens). */
export const DEFAULT_ANTHROPIC_MAX_TOKENS = 8_192;

function anthropicApiKey(): string {
  return process.env[ANTHROPIC_API_KEY_ENV] ?? "";
}

// ---------- schema ----------

/**
 * Strict Zod schema for `.harness/adapters/anthropic.yaml` →
 * `config.runtime_config`. Strict so typos at adapter-load or mission-override
 * time raise a Zod error instead of being silently dropped. The API key is NOT
 * part of the manifest — it is read from ANTHROPIC_API_KEY at run time.
 */
export const AnthropicRuntimeConfigSchema = z
  .object({
    base_url: z.string().url().default(DEFAULT_ANTHROPIC_BASE_URL),
    model: z.string().min(1).default(DEFAULT_ANTHROPIC_MODEL),
    max_tokens: z.number().int().positive().optional().default(DEFAULT_ANTHROPIC_MAX_TOKENS),
    request_timeout_ms: z.number().int().positive().optional().default(120_000),
    extra_headers: z.record(z.string(), z.string()).optional().default({}),
  })
  .strict();
export type AnthropicRuntimeConfig = z.infer<typeof AnthropicRuntimeConfigSchema>;
registerRuntimeConfigSchema("anthropic", AnthropicRuntimeConfigSchema);

/**
 * Live runtime checker. Hits `GET <base_url>/models` with the ANTHROPIC_API_KEY
 * + anthropic-version headers and a tight timeout. Maps the response to
 * AdapterCheckResult:
 *
 *  - no ANTHROPIC_API_KEY                 → not found, errors: set the env var (CI-skip signal)
 *  - 200 with JSON `{ data: [...] }`      → found, version: "<n> models available"
 *  - 401 / 403                            → not found, errors: check ANTHROPIC_API_KEY
 *  - 404                                  → not found, errors: endpoint mismatch
 *  - ECONNREFUSED / network unreachable   → not found, errors: network unreachable
 *  - timeout                              → not found, errors: "adapter check timed out"
 *  - other 4xx / 5xx                      → not found, errors: verbatim
 */
export const ANTHROPIC_CHECK_TIMEOUT_MS = 5_000;

export const anthropicRuntimeChecker: AdapterRuntimeChecker = async (manifest): Promise<AdapterCheckResult> => {
  const rc = manifest.config?.runtime_config as Record<string, unknown> | undefined;
  const baseUrl = typeof rc?.base_url === "string" && rc.base_url.length > 0 ? rc.base_url : DEFAULT_ANTHROPIC_BASE_URL;
  const apiKey = anthropicApiKey();
  if (apiKey.length === 0) {
    return {
      runtime: "anthropic",
      found: false,
      version: "",
      errors: [`anthropic: ${ANTHROPIC_API_KEY_ENV} not set; export it to enable the anthropic adapter`],
    };
  }
  const url = `${baseUrl.replace(/\/$/, "")}/models`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ANTHROPIC_CHECK_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { "x-api-key": apiKey, "anthropic-version": ANTHROPIC_VERSION },
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const message = (err as Error).message ?? String(err);
    const cause = (err as { cause?: { code?: string } }).cause;
    const code = cause?.code;
    if (controller.signal.aborted) {
      return {
        runtime: "anthropic",
        found: false,
        version: "",
        errors: [`anthropic: adapter check timed out after ${ANTHROPIC_CHECK_TIMEOUT_MS} ms`],
      };
    }
    if (code === "ECONNREFUSED" || /ECONNREFUSED|fetch failed/i.test(message)) {
      return {
        runtime: "anthropic",
        found: false,
        version: "",
        errors: [`anthropic: endpoint unreachable: ${baseUrl} (network unreachable or endpoint misconfigured)`],
      };
    }
    return {
      runtime: "anthropic",
      found: false,
      version: "",
      errors: [`anthropic: network error: ${code ? `${code}: ${message}` : message}`],
    };
  }
  clearTimeout(timer);

  let bodyText: string;
  try {
    bodyText = await response.text();
  } catch {
    bodyText = "";
  }

  if (response.status === 401 || response.status === 403) {
    const envelope = safeJsonEnvelope(bodyText);
    const detail = envelope ? `: ${envelope.message}` : "";
    return {
      runtime: "anthropic",
      found: false,
      version: "",
      errors: [`anthropic: HTTP ${response.status} from Anthropic${detail} (check ANTHROPIC_API_KEY)`],
    };
  }

  if (response.status === 404) {
    const envelope = safeJsonEnvelope(bodyText);
    const detail = envelope ? `: ${envelope.message}` : "";
    return {
      runtime: "anthropic",
      found: false,
      version: "",
      errors: [`anthropic: HTTP 404${detail} (check the base_url)`],
    };
  }

  if (!response.ok) {
    const envelope = safeJsonEnvelope(bodyText);
    const detail = envelope ? `: ${envelope.message}` : ` (body: ${bodyText.slice(0, 200)})`;
    return {
      runtime: "anthropic",
      found: false,
      version: "",
      errors: [`anthropic: HTTP ${response.status}${detail}`],
    };
  }

  // 200 path — surface model count if the body parses.
  let modelCount = 0;
  try {
    const parsed = JSON.parse(bodyText) as { data?: unknown };
    if (Array.isArray(parsed.data)) modelCount = parsed.data.length;
  } catch {
    // tolerate non-JSON bodies — surface the raw text in version.
  }
  return {
    runtime: "anthropic",
    found: true,
    version: modelCount > 0
      ? `anthropic reachable at ${baseUrl} (${modelCount} models available)`
      : `anthropic reachable at ${baseUrl}`,
    errors: [],
  };
};

function safeJsonEnvelope(text: string): { message: string } | null {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const env = extractErrorEnvelope(parsed);
    return env ? { message: env.message } : null;
  } catch {
    return null;
  }
}
runtimeRegistry.register("anthropic", anthropicRuntimeChecker);

// ---------- types ----------

export type CheckResult = {
  runtime: string;
  found: boolean;
  version: string;
  errors: string[];
};

export type DryRunResult = {
  command: string;
  args: string[];
  prompt: string;
  worktree: boolean;
  session_id_passthrough: boolean;
  errors: string[];
};

export type RunResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  result?: RuntimeResultDocument;
  /** UH-82 — id of the per-run artifact directory written. */
  runId: string;
};

export type AnthropicRunPlan = {
  command: string;
  args: string[];
  prompt: string;
  worktree: boolean;
  session_id_passthrough: boolean;
  errors: string[];
  mission: MissionDocument;
  baseUrl: string;
  headers: Record<string, string>;
  body: AnthropicRequestBody;
  requestTimeoutMs: number;
};

export interface AnthropicRequestBody {
  model: string;
  max_tokens: number;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface AnthropicRunnerInput {
  baseUrl: string;
  headers: Record<string, string>;
  body: AnthropicRequestBody;
  cwd: string;
  timeoutMs: number;
}

export interface AnthropicRunnerOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
  httpStatus?: number;
  errorEnvelope?: { message: string; type?: string; code?: string };
  networkError?: string;
  timedOut: boolean;
  events: Array<Record<string, unknown>>;
  /** Anthropic `usage` object (`{ input_tokens, output_tokens }`), when present. */
  usage?: unknown;
  /** Model id reported by the response, used to tag the usage event. */
  usageModel?: string;
  /** Anthropic `stop_reason` from the message, when present. */
  stopReason?: string;
}

export type AnthropicRunner = (input: AnthropicRunnerInput) => Promise<AnthropicRunnerOutput>;

export interface DiffCaptureResult {
  patch: string;
  errors?: string[];
}

export type DiffCollector = (cwd: string) => Promise<DiffCaptureResult>;

export interface PlanAnthropicOptions {
  /** UH-81 — CLI-time overrides spread on top of mission.runtime_config_overrides. */
  extraRuntimeConfigOverrides?: Record<string, unknown>;
  /** UH-82 — explicit per-run id; generated when absent. */
  runId?: string;
}

export interface RunAnthropicOptions {
  runner?: AnthropicRunner;
  collectDiff?: DiffCollector;
  timeoutMs?: number;
  /** UH-81 — forwarded into the planner so the merge happens before strict-parse. */
  extraRuntimeConfigOverrides?: Record<string, unknown>;
  /** Explicit per-run id; generated when absent. UH-82. */
  runId?: string;
}

export interface AnthropicCollectInput {
  root: string;
  artifacts: MissionArtifactContext | null;
  plan: AnthropicRunPlan;
  startedAt: string;
  finishedAt: string;
  runnerResult: AnthropicRunnerOutput;
  diff: DiffCaptureResult;
}

export interface AnthropicCollectOutput {
  exitCode: number;
  stderr: string;
  result?: RuntimeResultDocument;
}

// ---------- adapter manifest load ----------

export async function loadAdapterConfig(root: string, runtimeId: string): Promise<AdapterDocument> {
  const entry = await runtimeRegistry.load(root, runtimeId);
  return entry.document;
}

// ---------- planner ----------

/**
 * Compile a mission into the HTTP request plan the runner will dispatch.
 * Throws when the mission or adapter manifest cannot be loaded; recoverable
 * issues (missing workflow profile) are surfaced in `plan.errors[]`.
 */
export async function planAnthropicRun(root: string, missionPath: string, options: PlanAnthropicOptions = {}): Promise<AnthropicRunPlan> {
  const errors: string[] = [];
  const adapter = await loadAdapterConfig(root, "anthropic");

  let mission: MissionDocument;
  try {
    const content = await readFile(missionPath, "utf-8");
    const parsed = parse(content);
    mission = validateMission(parsed);
  } catch (e) {
    throw new Error(`Mission load error: ${(e as Error).message}`);
  }

  // UH-33: merge mission-level runtime_config_overrides on top of adapter
  // defaults, then strict-reparse. Strictness catches typos in either source.
  // UH-81: `options.extraRuntimeConfigOverrides` is the CLI-time
  // `--runtime-config-overrides <json>` payload; it wins over the
  // mission file (later spread = higher precedence).
  const mergedRuntimeConfig = {
    ...(adapter.config?.runtime_config ?? {}),
    ...mergeRuntimeConfigOverrides(mission, options.extraRuntimeConfigOverrides),
  };
  let runtimeConfig: AnthropicRuntimeConfig;
  try {
    runtimeConfig = AnthropicRuntimeConfigSchema.parse(mergedRuntimeConfig);
  } catch (e) {
    throw new Error(`Mission runtime_config_overrides validation failed: ${(e as Error).message}`);
  }

  let workflow: WorkflowDocument | undefined;
  const workflowPath = path.join(workflowsDir(root), `${mission.workflow_profile}.yaml`);
  try {
    const wfContent = await readFile(workflowPath, "utf-8");
    const wfParsed = parse(wfContent);
    workflow = validateWorkflow(wfParsed);
  } catch {
    errors.push(`Workflow profile not found: ${mission.workflow_profile}`);
  }

  const prompt = renderPrompt(buildDispatchContext(mission, workflow));

  const body: AnthropicRequestBody = {
    model: runtimeConfig.model,
    max_tokens: runtimeConfig.max_tokens,
    messages: [{ role: "user", content: prompt }],
  };

  // Build headers. The Anthropic API key comes from ANTHROPIC_API_KEY (a
  // secret, never the manifest); a missing key is surfaced as a plan error so
  // `run` fails fast and `dry-run` shows it. extra_headers wins for
  // forward-compat; keys are lower-cased so duplicates don't slip in.
  const apiKey = anthropicApiKey();
  if (apiKey.length === 0) {
    errors.push(`${ANTHROPIC_API_KEY_ENV} not set; export it before running the anthropic adapter`);
  }
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": ANTHROPIC_VERSION,
  };
  for (const [k, v] of Object.entries(runtimeConfig.extra_headers)) {
    headers[k.toLowerCase()] = v;
  }

  return {
    command: `POST ${runtimeConfig.base_url}/messages`,
    args: [JSON.stringify(body, null, 2)],
    prompt,
    worktree: adapter.config?.worktree_mode === true,
    session_id_passthrough: adapter.config?.pass_session_id === true,
    errors,
    mission,
    baseUrl: runtimeConfig.base_url,
    headers,
    body,
    requestTimeoutMs: runtimeConfig.request_timeout_ms,
  };
}

// ---------- runner ----------

/**
 * Default runner. POSTs the Messages request to the Anthropic API and parses
 * the JSON body. The Messages API is request/response (no SSE unless
 * `stream:true`, which this adapter does not set), so we always read the whole
 * body. Honors timeoutMs via AbortController. Surfaces:
 *
 *  - HTTP status via `httpStatus`
 *  - parsed error envelope via `errorEnvelope`
 *  - network failure via `networkError` (e.g. ECONNREFUSED)
 *
 * Never throws — callers translate the structured output into a
 * RuntimeResultStatus via `collectAnthropicSession`.
 */
export const defaultAnthropicRunner: AnthropicRunner = async (input) => {
  const out: AnthropicRunnerOutput = {
    stdout: "",
    stderr: "",
    exitCode: 0,
    timedOut: false,
    events: [],
  };

  const controller = new AbortController();
  const timer = input.timeoutMs > 0
    ? setTimeout(() => {
        out.timedOut = true;
        controller.abort();
      }, input.timeoutMs)
    : undefined;

  const url = `${input.baseUrl.replace(/\/$/, "")}/messages`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: input.headers,
      body: JSON.stringify(input.body),
      signal: controller.signal,
    });
  } catch (err) {
    if (timer) clearTimeout(timer);
    const message = (err as Error).message ?? String(err);
    const cause = (err as { cause?: { code?: string } }).cause;
    const code = cause?.code;
    if (out.timedOut) {
      out.stderr = `anthropic: request timed out after ${input.timeoutMs} ms\n`;
      out.exitCode = 1;
      return out;
    }
    out.networkError = code ? `${code}: ${message}` : message;
    out.stderr = `${out.networkError}\n`;
    out.exitCode = 1;
    return out;
  }

  out.httpStatus = response.status;

  let bodyText: string;
  try {
    bodyText = await response.text();
  } catch (err) {
    bodyText = `<body read error: ${(err as Error).message}>`;
  } finally {
    if (timer) clearTimeout(timer);
  }

  try {
    const parsed = JSON.parse(bodyText) as Record<string, unknown>;
    out.events.push(parsed);
    if (response.ok) {
      out.stdout = extractMessageText(parsed);
      if (parsed.usage !== undefined) out.usage = parsed.usage;
      if (typeof parsed.model === "string") out.usageModel = parsed.model;
      if (typeof parsed.stop_reason === "string") out.stopReason = parsed.stop_reason;
      if (out.stdout.length === 0) {
        out.stderr = "anthropic: empty assistant message\n";
        out.exitCode = 1;
      }
    } else {
      const envelope = extractErrorEnvelope(parsed);
      if (envelope) out.errorEnvelope = envelope;
      out.stderr = bodyText;
      out.exitCode = 1;
    }
  } catch (err) {
    out.stderr = `anthropic: invalid JSON response: ${(err as Error).message}\nbody: ${bodyText}\n`;
    out.exitCode = 1;
  }

  return out;
};

function extractErrorEnvelope(payload: unknown): { message: string; type?: string; code?: string } | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const obj = payload as Record<string, unknown>;
  // Standard Anthropic shape: `{ "type": "error", "error": { "type", "message" } }`.
  const error = obj.error;
  if (error && typeof error === "object" && !Array.isArray(error)) {
    const e = error as Record<string, unknown>;
    if (typeof e.message === "string") {
      return {
        message: e.message,
        type: typeof e.type === "string" ? e.type : undefined,
        code: typeof e.code === "string" ? e.code : undefined,
      };
    }
  }
  // Flat shape some gateways use: `{ "status", "message" }`.
  if (typeof obj.message === "string" && (typeof obj.status === "number" || typeof obj.status === "string")) {
    return {
      message: obj.message,
      type: typeof obj.type === "string" ? obj.type : undefined,
      code: typeof obj.code === "string" ? obj.code : undefined,
    };
  }
  return null;
}

/**
 * Concatenate the text of every `type:"text"` content block in an Anthropic
 * Messages response. Non-text blocks (e.g. tool_use) are ignored — this
 * adapter is a plain text model client.
 */
export function extractMessageText(payload: Record<string, unknown>): string {
  const content = payload.content;
  if (!Array.isArray(content)) return "";
  let text = "";
  for (const block of content) {
    if (block && typeof block === "object" && !Array.isArray(block)) {
      const b = block as Record<string, unknown>;
      if (b.type === "text" && typeof b.text === "string") {
        text += b.text;
      }
    }
  }
  return text;
}

/**
 * Pure parser for an Anthropic Messages response body. Exported for tests.
 * Returns the concatenated text content, the parsed message object, any usage,
 * and any error envelope encountered.
 */
export function parseAnthropicResponse(buffer: string): {
  content: string;
  message: Record<string, unknown> | null;
  usage: unknown;
  stopReason?: string;
  errorEnvelope: { message: string; type?: string; code?: string } | null;
} {
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(buffer) as Record<string, unknown>;
  } catch {
    return { content: "", message: null, usage: undefined, errorEnvelope: null };
  }
  const envelope = extractErrorEnvelope(parsed);
  return {
    content: envelope ? "" : extractMessageText(parsed),
    message: parsed,
    usage: parsed.usage,
    stopReason: typeof parsed.stop_reason === "string" ? parsed.stop_reason : undefined,
    errorEnvelope: envelope,
  };
}

// ---------- diff collector ----------

export const defaultDiffCollector: DiffCollector = async (cwd) => {
  return captureDiffWithUntracked(cwd);
};

// ---------- orchestrator ----------

export async function dryRunAnthropic(root: string, missionPath: string): Promise<DryRunResult> {
  try {
    const plan = await planAnthropicRun(root, missionPath);
    const artifacts = await getMissionArtifactContext(root, missionPath, generateRunId());
    if (artifacts) {
      await persistPromptAndSession(artifacts, plan.prompt, {
        schema_version: "uh.runtime-session.v0",
        mission_id: plan.mission.id,
        runtime: "anthropic",
        status: "planned",
        command: plan.command,
        args: plan.args,
      });
    }
    return {
      command: plan.command,
      args: plan.args,
      prompt: plan.prompt,
      worktree: plan.worktree,
      session_id_passthrough: plan.session_id_passthrough,
      errors: plan.errors,
    };
  } catch (e) {
    return {
      command: "",
      args: [],
      prompt: "",
      worktree: false,
      session_id_passthrough: false,
      errors: [(e as Error).message],
    };
  }
}

/**
 * Execute a mission against the anthropic runtime end-to-end.
 *
 * Orchestrates: planAnthropicRun -> writeable artifact context ->
 * runtime.started audit -> runner invocation -> diff capture ->
 * collectAnthropicSession. The runner and diff collector are injectable
 * so tests can drive deterministic outcomes via in-process http servers
 * or pure mocks.
 */
export async function runAnthropic(
  root: string,
  missionPath: string,
  options: RunAnthropicOptions = {},
): Promise<RunResult> {
  const plan = await planAnthropicRun(root, missionPath, { extraRuntimeConfigOverrides: options.extraRuntimeConfigOverrides });
  if (plan.errors.length > 0) {
    throw new Error(plan.errors.join("; "));
  }

  const runId = options.runId ?? generateRunId();
  const startedAt = new Date().toISOString();
  const artifacts = await getMissionArtifactContext(root, missionPath, runId);

  if (artifacts) {
    await writeLatestPointer(root, plan.mission.id, {
      schema_version: "uh.latest-run.v0",
      run_id: runId,
      started_at: startedAt,
      status: "running",
    });
    await appendRunsIndexEntry(root, plan.mission.id, {
      run_id: runId,
      started_at: startedAt,
      status: "running",
      runtime: "anthropic",
    });
    await persistPromptAndSession(artifacts, plan.prompt, {
      schema_version: "uh.runtime-session.v0",
      mission_id: plan.mission.id,
      runtime: "anthropic",
      status: "running",
      command: plan.command,
      args: plan.args,
      started_at: startedAt,
    });
    await appendMissionEvent(artifacts, {
      event: "runtime.started",
      timestamp: startedAt,
      runtime: "anthropic",
      mission_id: plan.mission.id,
      command: plan.command,
      args: plan.args,
      run_id: runId,
    });
  }

  try {
    const logPath = auditLog(root);
    const auditEntry = JSON.stringify({
      event: "mission.run",
      timestamp: new Date().toISOString(),
      runtime: "anthropic",
      mission_id: plan.mission.id,
      mission_name: plan.mission.name,
      workflow: plan.mission.workflow_profile,
      run_id: runId,
    });
    await appendFile(logPath, `${auditEntry}\n`, "utf-8");
  } catch {
    // audit failure shouldn't block run
  }

  const runner = options.runner ?? defaultAnthropicRunner;
  let runnerResult: AnthropicRunnerOutput;
  let collection: AnthropicCollectOutput;
  try {
    runnerResult = await runner({
      baseUrl: plan.baseUrl,
      headers: plan.headers,
      body: plan.body,
      cwd: root,
      timeoutMs: options.timeoutMs ?? plan.requestTimeoutMs,
    });

    const collectDiff = options.collectDiff ?? defaultDiffCollector;
    const diff = await collectDiff(root);
    const finishedAt = new Date().toISOString();

    collection = await collectAnthropicSession({
      root,
      artifacts,
      plan,
      startedAt,
      finishedAt,
      runnerResult,
      diff,
    });
  } finally {
    if (artifacts) {
      try {
        await mirrorRuntimeResultToLatest(root, plan.mission.id, runId);
      } catch {
        // best-effort.
      }
    }
  }

  if (artifacts) {
    const finishedAt = new Date().toISOString();
    const terminalStatus = deriveAnthropicRunStatus(collection.result, collection.exitCode);
    await writeLatestPointer(root, plan.mission.id, {
      schema_version: "uh.latest-run.v0",
      run_id: runId,
      started_at: startedAt,
      finished_at: finishedAt,
      status: terminalStatus,
    });
    await appendRunsIndexEntry(root, plan.mission.id, {
      run_id: runId,
      started_at: startedAt,
      finished_at: finishedAt,
      status: terminalStatus,
      runtime: "anthropic",
    });
  }

  return {
    exitCode: collection.exitCode,
    stdout: runnerResult.stdout,
    stderr: collection.stderr,
    result: collection.result,
    runId,
  };
}

function deriveAnthropicRunStatus(
  result: RuntimeResultDocument | undefined,
  exitCode: number,
): RunStatus {
  if (result?.status) return result.status;
  return exitCode === 0 ? "blocked" : "failed";
}

// ---------- collector ----------

/**
 * Persist a completed anthropic session and classify the
 * RuntimeResultStatus. Mirrors `collectOpenRouterSession` shape.
 * Classification table:
 *
 *  network ECONNREFUSED       -> blocked ("network unreachable or endpoint misconfigured")
 *  network ETIMEDOUT          -> blocked
 *  timedOut (AbortController)  -> failed
 *  errorEnvelope auth         -> blocked  ("check ANTHROPIC_API_KEY")
 *  http 401 / 403             -> blocked
 *  http 429 (rate limit)      -> blocked
 *  http 404 + model_not_found -> blocked
 *  http 4xx/5xx               -> failed
 *  exitCode != 0              -> failed
 *  200 + empty content        -> failed
 *  200 + content + sentinel   -> passed; runtime-final.txt = sentinel
 *  200 + content (no sentinel) -> passed; runtime-final.txt = "" (matches
 *                                 oh-my-pi / openrouter behaviour)
 */
export async function collectAnthropicSession(
  input: AnthropicCollectInput,
): Promise<AnthropicCollectOutput> {
  const { artifacts, plan, runnerResult, diff, startedAt, finishedAt, root } = input;

  const errors: string[] = [];
  let stderr = runnerResult.stderr;
  let exitCode = runnerResult.exitCode;

  if (runnerResult.timedOut) {
    errors.push(`anthropic: request timed out after ${plan.requestTimeoutMs} ms`);
    if (exitCode === 0) exitCode = 1;
  }
  if (diff.errors) {
    errors.push(...diff.errors);
  }

  const status = classifyStatus(runnerResult, plan, errors);

  // Sentinel extraction: scan the assistant content for the UH-28 fenced
  // block. Absent ⇒ runtime-final.txt is written empty (oh-my-pi parity).
  const sentinel = extractRuntimeFinalMessageSentinel(runnerResult.stdout) ?? "";

  if (!artifacts) {
    return { exitCode, stderr };
  }

  let result: RuntimeResultDocument | undefined;
  try {
    await writeArtifactFile(artifacts.missionDir, artifacts.stdoutPath, runnerResult.stdout);
    await writeArtifactFile(artifacts.missionDir, artifacts.stderrPath, stderr);
    await writeArtifactFile(artifacts.missionDir, artifacts.diffPath, diff.patch);
    await writeArtifactFile(artifacts.missionDir, artifacts.finalMessagePath, sentinel);

    for (const event of runnerResult.events) {
      await appendMissionEvent(artifacts, {
        event: "anthropic.message",
        timestamp: new Date().toISOString(),
        payload: event,
      });
    }

    const draft: RuntimeResultDocument = {
      schema_version: "uh.runtime-result.v0",
      mission_id: plan.mission.id,
      runtime: "anthropic",
      status,
      started_at: startedAt,
      finished_at: finishedAt,
      exit_code: exitCode,
      prompt_path: path.relative(root, artifacts.promptPath),
      stdout_path: path.relative(root, artifacts.stdoutPath),
      stderr_path: path.relative(root, artifacts.stderrPath),
      diff_path: path.relative(root, artifacts.diffPath),
      errors,
    };
    result = validateRuntimeResult(draft);
    await writeArtifactFile(artifacts.missionDir, artifacts.runtimeResultPath, stringify(result));

    await persistFinalRuntimeSession(
      artifacts,
      plan,
      startedAt,
      finishedAt,
      exitCode,
      exitCode === 0 ? "succeeded" : "failed",
    );

    const apiUsage =
      usageFromAnthropic(runnerResult.usage, runnerResult.usageModel) ??
      estimateUsage(plan.prompt, sentinel);
    await appendMissionEvent(
      artifacts,
      buildUsageEvent("anthropic", plan.mission.id, apiUsage, finishedAt),
    );
  } catch (err) {
    const message = (err as Error).message;
    const separator = stderr && !stderr.endsWith("\n") ? "\n" : "";
    stderr = `${stderr}${separator}Artifact persistence failure: ${message}`;
    return { exitCode: exitCode === 0 ? 1 : exitCode, stderr };
  }

  return { exitCode, stderr, result };
}

function classifyStatus(
  runner: AnthropicRunnerOutput,
  plan: AnthropicRunPlan,
  errors: string[],
): RuntimeResultStatus {
  // Network-level failure first; the endpoint may simply be unreachable.
  if (runner.networkError) {
    if (/ECONNREFUSED/.test(runner.networkError)) {
      errors.push(`anthropic: endpoint unreachable: ${plan.baseUrl} (network unreachable or endpoint misconfigured)`);
      return "blocked";
    }
    if (/ETIMEDOUT/.test(runner.networkError) || /ENETUNREACH/.test(runner.networkError)) {
      errors.push(`anthropic: network error: ${runner.networkError}`);
      return "blocked";
    }
    errors.push(`anthropic: network error: ${runner.networkError}`);
    return "failed";
  }

  if (runner.timedOut) {
    return "failed";
  }

  const envelope = runner.errorEnvelope;
  if (envelope && /authentication|invalid_api_key|permission/i.test(`${envelope.type ?? ""} ${envelope.code ?? ""} ${envelope.message}`)) {
    errors.push(`anthropic: auth failed: ${envelope.message} (check ANTHROPIC_API_KEY)`);
    return "blocked";
  }

  const status = runner.httpStatus;
  if (typeof status === "number") {
    if (status === 401 || status === 403) {
      errors.push(
        `anthropic: HTTP ${status}: ${envelope?.message ?? "auth required"} (check ANTHROPIC_API_KEY)`,
      );
      return "blocked";
    }
    if (status === 429) {
      errors.push(`anthropic: HTTP 429: ${envelope?.message ?? "rate limited"} (retry later)`);
      return "blocked";
    }
    if (status === 404 && envelope && /model/i.test(`${envelope.message} ${envelope.code ?? ""}`)) {
      errors.push(`anthropic: model "${plan.body.model}" not available: ${envelope.message}`);
      return "blocked";
    }
    if (status >= 400) {
      errors.push(`anthropic: HTTP ${status}: ${envelope?.message ?? "request failed"}`);
      return "failed";
    }
  }

  if (runner.exitCode !== 0) {
    if (runner.stdout.length === 0) {
      errors.push("anthropic: empty assistant message");
    }
    return "failed";
  }

  if (runner.stdout.trim().length === 0) {
    errors.push("anthropic: empty assistant message");
    return "failed";
  }

  return "passed";
}

async function persistFinalRuntimeSession(
  artifacts: MissionArtifactContext,
  plan: AnthropicRunPlan,
  startedAt: string,
  finishedAt: string,
  exitCode: number,
  sessionStatus: "succeeded" | "failed",
): Promise<void> {
  await persistPromptAndSession(artifacts, plan.prompt, {
    schema_version: "uh.runtime-session.v0",
    mission_id: plan.mission.id,
    runtime: "anthropic",
    status: sessionStatus,
    command: plan.command,
    args: plan.args,
    exit_code: exitCode,
    started_at: startedAt,
    finished_at: finishedAt,
  });
  await appendMissionEvent(artifacts, {
    event: "runtime.finished",
    timestamp: finishedAt,
    runtime: "anthropic",
    mission_id: plan.mission.id,
    exit_code: exitCode,
    status: sessionStatus,
  });
}
