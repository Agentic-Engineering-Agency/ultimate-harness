import { z } from "zod";
import { readFile, appendFile } from "node:fs/promises";
import {
  type MissionArtifactContext,
  getMissionArtifactContext,
  assertWritableArtifact,
  assertPathInsideMissionDir,
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
import { buildUsageEvent, estimateUsage, usageFromOpenAI } from "../harness/usage.js";
import {
  appendRunsIndexEntry,
  generateRunId,
  mirrorRuntimeResultToLatest,
  writeLatestPointer,
} from "../harness/run-id.js";
import type { RunStatus } from "../schema/runs.js";
import {
  RuntimeSessionDocument,
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
 * OpenRouter runtime adapter (S1 #134).
 *
 * OpenAI-compatible HTTP client for https://openrouter.ai/api/v1 — the cheapest
 * pay-per-token routing target, complementary to the subscription-backed
 * hermes-proxy. The API key is read from the OPENROUTER_API_KEY environment
 * variable and never stored in the manifest; when it is absent the adapter
 * check degrades gracefully (found:false) so CI can skip live calls. Optional
 * HTTP-Referer / X-Title headers identify the app in OpenRouter's rankings.
 */

/** Env var holding the OpenRouter API key (a secret — never in the manifest). */
export const OPENROUTER_API_KEY_ENV = "OPENROUTER_API_KEY";
/** Default OpenRouter OpenAI-compat base URL. */
export const DEFAULT_OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1";

function openRouterApiKey(): string {
  return process.env[OPENROUTER_API_KEY_ENV] ?? "";
}

// ---------- schema ----------

/**
 * Strict Zod schema for `.harness/adapters/openrouter.yaml` →
 * `config.runtime_config`. Strict so typos at adapter-load or mission-override
 * time raise a Zod error instead of being silently dropped. The API key is NOT
 * part of the manifest — it is read from OPENROUTER_API_KEY at run time.
 */
export const OpenRouterRuntimeConfigSchema = z
  .object({
    endpoint: z.string().url().default(DEFAULT_OPENROUTER_ENDPOINT),
    model: z.string().min(1),
    request_timeout_ms: z.number().int().positive().optional().default(120_000),
    extra_headers: z.record(z.string(), z.string()).optional().default({}),
    /** Optional OpenRouter ranking headers (HTTP-Referer / X-Title). */
    referer: z.string().url().optional(),
    title: z.string().min(1).optional(),
  })
  .strict();
export type OpenRouterRuntimeConfig = z.infer<typeof OpenRouterRuntimeConfigSchema>;
registerRuntimeConfigSchema("openrouter", OpenRouterRuntimeConfigSchema);

/**
 * Live runtime checker. Hits `GET <endpoint>/models` with the OPENROUTER_API_KEY
 * bearer and a tight timeout. Maps the response to AdapterCheckResult:
 *
 *  - no OPENROUTER_API_KEY                → not found, errors: set the env var (CI-skip signal)
 *  - 200 with JSON `{ data: [...] }`      → found, version: "<n> models available"
 *  - 401 / 403                            → not found, errors: check OPENROUTER_API_KEY
 *  - 404                                   → not found, errors: endpoint mismatch
 *  - ECONNREFUSED / network unreachable   → not found, errors: network unreachable
 *  - timeout                              → not found, errors: "adapter check timed out"
 *  - other 4xx / 5xx                      → not found, errors: verbatim
 */
export const OPENROUTER_CHECK_TIMEOUT_MS = 5_000;

export const openRouterRuntimeChecker: AdapterRuntimeChecker = async (manifest): Promise<AdapterCheckResult> => {
  const rc = manifest.config?.runtime_config as Record<string, unknown> | undefined;
  const endpoint = typeof rc?.endpoint === "string" && rc.endpoint.length > 0 ? rc.endpoint : DEFAULT_OPENROUTER_ENDPOINT;
  const apiKey = openRouterApiKey();
  if (apiKey.length === 0) {
    return {
      runtime: "openrouter",
      found: false,
      version: "",
      errors: [`openrouter: ${OPENROUTER_API_KEY_ENV} not set; export it to enable the openrouter adapter`],
    };
  }
  const url = `${endpoint.replace(/\/$/, "")}/models`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPENROUTER_CHECK_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const message = (err as Error).message ?? String(err);
    const cause = (err as { cause?: { code?: string } }).cause;
    const code = cause?.code;
    if (controller.signal.aborted) {
      return {
        runtime: "openrouter",
        found: false,
        version: "",
        errors: [`openrouter: adapter check timed out after ${OPENROUTER_CHECK_TIMEOUT_MS} ms`],
      };
    }
    if (code === "ECONNREFUSED" || /ECONNREFUSED|fetch failed/i.test(message)) {
      return {
        runtime: "openrouter",
        found: false,
        version: "",
        errors: [`openrouter: endpoint unreachable: ${endpoint} (network unreachable or endpoint misconfigured)`],
      };
    }
    return {
      runtime: "openrouter",
      found: false,
      version: "",
      errors: [`openrouter: network error: ${code ? `${code}: ${message}` : message}`],
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
      runtime: "openrouter",
      found: false,
      version: "",
      errors: [`openrouter: HTTP ${response.status} from OpenRouter${detail} (check OPENROUTER_API_KEY)`],
    };
  }

  if (response.status === 404) {
    const envelope = safeJsonEnvelope(bodyText);
    const detail = envelope ? `: ${envelope.message}` : "";
    return {
      runtime: "openrouter",
      found: false,
      version: "",
      errors: [`openrouter: HTTP 404${detail} (check the endpoint URL)`],
    };
  }

  if (!response.ok) {
    const envelope = safeJsonEnvelope(bodyText);
    const detail = envelope ? `: ${envelope.message}` : ` (body: ${bodyText.slice(0, 200)})`;
    return {
      runtime: "openrouter",
      found: false,
      version: "",
      errors: [`openrouter: HTTP ${response.status}${detail}`],
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
    runtime: "openrouter",
    found: true,
    version: modelCount > 0
      ? `openrouter reachable at ${endpoint} (${modelCount} models available)`
      : `openrouter reachable at ${endpoint}`,
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
runtimeRegistry.register("openrouter", openRouterRuntimeChecker);

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

export type OpenRouterRunPlan = {
  command: string;
  args: string[];
  prompt: string;
  worktree: boolean;
  session_id_passthrough: boolean;
  errors: string[];
  mission: MissionDocument;
  endpoint: string;
  headers: Record<string, string>;
  body: OpenRouterRequestBody;
  requestTimeoutMs: number;
};

export interface OpenRouterRequestBody {
  model: string;
  messages: Array<{ role: "user" | "system" | "assistant"; content: string }>;
  stream: boolean;
}

export interface OpenRouterRunnerInput {
  endpoint: string;
  headers: Record<string, string>;
  body: OpenRouterRequestBody;
  cwd: string;
  timeoutMs: number;
}

export interface OpenRouterRunnerOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
  httpStatus?: number;
  errorEnvelope?: { message: string; type?: string; code?: string };
  networkError?: string;
  timedOut: boolean;
  events: Array<Record<string, unknown>>;
  /** OpenAI-style `usage` object from the response, when the proxy returns one. */
  usage?: unknown;
  /** Model id reported by the response, used to tag the usage event. */
  usageModel?: string;
}

export type OpenRouterRunner = (input: OpenRouterRunnerInput) => Promise<OpenRouterRunnerOutput>;

export interface DiffCaptureResult {
  patch: string;
  errors?: string[];
}

export type DiffCollector = (cwd: string) => Promise<DiffCaptureResult>;

export interface PlanOpenRouterOptions {
  /** UH-81 — CLI-time overrides spread on top of mission.runtime_config_overrides. */
  extraRuntimeConfigOverrides?: Record<string, unknown>;
  /** UH-82 — explicit per-run id; generated when absent. */
  runId?: string;
}

export interface RunOpenRouterOptions {
  runner?: OpenRouterRunner;
  collectDiff?: DiffCollector;
  timeoutMs?: number;
  /** UH-81 — forwarded into the planner so the merge happens before strict-parse. */
  extraRuntimeConfigOverrides?: Record<string, unknown>;
  /** Explicit per-run id; generated when absent. UH-82. */
  runId?: string;
}

export interface OpenRouterCollectInput {
  root: string;
  artifacts: MissionArtifactContext | null;
  plan: OpenRouterRunPlan;
  startedAt: string;
  finishedAt: string;
  runnerResult: OpenRouterRunnerOutput;
  diff: DiffCaptureResult;
}

export interface OpenRouterCollectOutput {
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
export async function planOpenRouterRun(root: string, missionPath: string, options: PlanOpenRouterOptions = {}): Promise<OpenRouterRunPlan> {
  const errors: string[] = [];
  const adapter = await loadAdapterConfig(root, "openrouter");

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
  let runtimeConfig: OpenRouterRuntimeConfig;
  try {
    runtimeConfig = OpenRouterRuntimeConfigSchema.parse(mergedRuntimeConfig);
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

  const body: OpenRouterRequestBody = {
    model: runtimeConfig.model,
    messages: [{ role: "user", content: prompt }],
    stream: true,
  };

  // Build headers. The OpenRouter API key comes from OPENROUTER_API_KEY (a
  // secret, never the manifest); a missing key is surfaced as a plan error so
  // `run` fails fast and `dry-run` shows it. Optional referer/title set the
  // OpenRouter ranking headers. extra_headers wins for forward-compat; keys are
  // lower-cased so duplicates don't slip in.
  const apiKey = openRouterApiKey();
  if (apiKey.length === 0) {
    errors.push(`${OPENROUTER_API_KEY_ENV} not set; export it before running the openrouter adapter`);
  }
  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`,
  };
  if (runtimeConfig.referer) headers["http-referer"] = runtimeConfig.referer;
  if (runtimeConfig.title) headers["x-title"] = runtimeConfig.title;
  for (const [k, v] of Object.entries(runtimeConfig.extra_headers)) {
    headers[k.toLowerCase()] = v;
  }

  return {
    command: `POST ${runtimeConfig.endpoint}/chat/completions`,
    args: [JSON.stringify(body, null, 2)],
    prompt,
    worktree: adapter.config?.worktree_mode === true,
    session_id_passthrough: adapter.config?.pass_session_id === true,
    errors,
    mission,
    endpoint: runtimeConfig.endpoint,
    headers,
    body,
    requestTimeoutMs: runtimeConfig.request_timeout_ms,
  };
}

// ---------- runner ----------

/**
 * Default runner. POSTs the OpenAI Chat Completions request to the proxy,
 * sniffs the response content-type, and either decodes an SSE stream or
 * parses a JSON body. Honors timeoutMs via AbortController. Surfaces:
 *
 *  - HTTP status via `httpStatus`
 *  - parsed error envelope via `errorEnvelope` (proxy or upstream-side)
 *  - network failure via `networkError` (e.g. ECONNREFUSED)
 *  - SSE events via `events`
 *
 * Never throws — callers translate the structured output into a
 * RuntimeResultStatus via `collectOpenRouterSession`.
 */
export const defaultOpenRouterRunner: OpenRouterRunner = async (input) => {
  const out: OpenRouterRunnerOutput = {
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

  const url = `${input.endpoint.replace(/\/$/, "")}/chat/completions`;
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
    out.networkError = code ? `${code}: ${message}` : message;
    out.stderr = `${out.networkError}\n`;
    out.exitCode = 1;
    return out;
  }

  out.httpStatus = response.status;
  const contentType = response.headers.get("content-type") ?? "";

  // Read SSE only on a successful 200 with the right content-type; everything
  // else is parsed as JSON, with a text fallback.
  if (response.ok && contentType.includes("text/event-stream")) {
    const reader = response.body?.getReader();
    if (!reader) {
      out.stderr = "openrouter: response had no readable body\n";
      out.exitCode = 1;
      if (timer) clearTimeout(timer);
      return out;
    }
    const decoder = new TextDecoder();
    let pending = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        // SSE frames terminate on a blank line. Emit each complete frame.
        let idx = pending.indexOf("\n\n");
        while (idx !== -1) {
          const frame = pending.slice(0, idx);
          pending = pending.slice(idx + 2);
          const result = handleSseFrame(frame, out);
          if (result === "DONE") {
            pending = "";
            break;
          }
          idx = pending.indexOf("\n\n");
        }
      }
      // Flush any trailing frame.
      if (pending.length > 0) {
        handleSseFrame(pending, out);
      }
    } catch (err) {
      // AbortError surfaces here on timeout.
      if (out.timedOut) {
        out.stderr += `openrouter: request timed out after ${input.timeoutMs} ms\n`;
      } else {
        const message = (err as Error).message ?? String(err);
        out.stderr += `openrouter stream read error: ${message}\n`;
      }
      out.exitCode = 1;
    } finally {
      if (timer) clearTimeout(timer);
    }
    return out;
  }

  // Non-SSE path: read the whole body.
  let bodyText: string;
  try {
    bodyText = await response.text();
  } catch (err) {
    bodyText = `<body read error: ${(err as Error).message}>`;
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (contentType.includes("application/json")) {
    try {
      const parsed = JSON.parse(bodyText) as Record<string, unknown>;
      if (response.ok) {
        // OpenAI non-streaming success: extract choices[0].message.content.
        out.stdout = extractMessageContent(parsed);
        if (parsed.usage !== undefined) out.usage = parsed.usage;
        if (typeof parsed.model === "string") out.usageModel = parsed.model;
        if (out.stdout.length === 0) {
          out.stderr = "openrouter: empty assistant message\n";
          out.exitCode = 1;
        }
      } else {
        const envelope = extractErrorEnvelope(parsed);
        if (envelope) out.errorEnvelope = envelope;
        out.stderr = bodyText;
        out.exitCode = 1;
      }
    } catch (err) {
      out.stderr = `openrouter: invalid JSON response: ${(err as Error).message}\nbody: ${bodyText}\n`;
      out.exitCode = 1;
    }
  } else {
    // Plain text / HTML / nothing useful — surface verbatim.
    out.stderr = bodyText;
    out.exitCode = response.ok ? 0 : 1;
  }

  return out;
};

function handleSseFrame(rawFrame: string, out: OpenRouterRunnerOutput): "DONE" | "OK" {
  const trimmed = rawFrame.trim();
  if (trimmed.length === 0) return "OK";
  for (const line of trimmed.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (data === "[DONE]") return "DONE";
    try {
      const parsed = JSON.parse(data) as Record<string, unknown>;
      out.events.push(parsed);
      // OpenAI streaming usage arrives in a trailing frame (stream_options:
      // {include_usage:true}); capture it when present.
      if (parsed.usage !== undefined && parsed.usage !== null) out.usage = parsed.usage;
      if (typeof parsed.model === "string") out.usageModel = parsed.model;
      // Error events: surface envelope, append to stderr, abort the stream.
      const envelope = extractErrorEnvelope(parsed);
      if (envelope) {
        out.errorEnvelope = envelope;
        out.stderr += `${data}\n`;
        out.exitCode = 1;
        return "DONE";
      }
      const choices = parsed.choices;
      if (Array.isArray(choices) && choices.length > 0) {
        const choice = choices[0] as Record<string, unknown>;
        const delta = choice.delta as Record<string, unknown> | undefined;
        if (delta && typeof delta.content === "string") {
          out.stdout += delta.content;
        }
        const message = choice.message as Record<string, unknown> | undefined;
        if (message && typeof message.content === "string" && out.stdout.length === 0) {
          out.stdout += message.content;
        }
      }
    } catch (err) {
      out.stderr += `openrouter SSE parse error: ${(err as Error).message}\nframe: ${data}\n`;
    }
  }
  return "OK";
}

function extractErrorEnvelope(payload: unknown): { message: string; type?: string; code?: string } | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const obj = payload as Record<string, unknown>;
  // Standard OpenAI shape: `{ "error": { "message", "type", "code" } }`.
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
  // Flat shape some proxies/upstreams use: `{ "status", "message" }`.
  if (typeof obj.message === "string" && (typeof obj.status === "number" || typeof obj.status === "string")) {
    return {
      message: obj.message,
      type: typeof obj.type === "string" ? obj.type : undefined,
      code: typeof obj.code === "string" ? obj.code : undefined,
    };
  }
  return null;
}

function extractMessageContent(payload: Record<string, unknown>): string {
  const choices = payload.choices;
  if (!Array.isArray(choices) || choices.length === 0) return "";
  const choice = choices[0] as Record<string, unknown>;
  const message = choice.message as Record<string, unknown> | undefined;
  if (message && typeof message.content === "string") return message.content;
  const delta = choice.delta as Record<string, unknown> | undefined;
  if (delta && typeof delta.content === "string") return delta.content;
  return "";
}

/**
 * Pure parser for an SSE byte buffer. Exported for tests; the runner uses
 * the streaming variant above for incremental decoding. Returns the
 * concatenated content, the parsed event objects, and any error envelope
 * encountered.
 */
export function parseOpenRouterStream(buffer: string): {
  content: string;
  events: Array<Record<string, unknown>>;
  errorEnvelope: { message: string; type?: string; code?: string } | null;
} {
  const out: OpenRouterRunnerOutput = {
    stdout: "",
    stderr: "",
    exitCode: 0,
    timedOut: false,
    events: [],
  };
  // Tolerate `\r\n\r\n` and `\n\n` frame separators.
  const normalized = buffer.replace(/\r\n/g, "\n");
  for (const frame of normalized.split("\n\n")) {
    if (handleSseFrame(frame, out) === "DONE") break;
  }
  return {
    content: out.stdout,
    events: out.events,
    errorEnvelope: out.errorEnvelope ?? null,
  };
}

// ---------- diff collector ----------

export const defaultDiffCollector: DiffCollector = async (cwd) => {
  return captureDiffWithUntracked(cwd);
};

// ---------- orchestrator ----------

export async function dryRunOpenRouter(root: string, missionPath: string): Promise<DryRunResult> {
  try {
    const plan = await planOpenRouterRun(root, missionPath);
    const artifacts = await getMissionArtifactContext(root, missionPath, generateRunId());
    if (artifacts) {
      await persistPromptAndSession(artifacts, plan.prompt, {
        schema_version: "uh.runtime-session.v0",
        mission_id: plan.mission.id,
        runtime: "openrouter",
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
 * Execute a mission against the openrouter runtime end-to-end.
 *
 * Orchestrates: planOpenRouterRun -> writeable artifact context ->
 * runtime.started audit -> runner invocation -> diff capture ->
 * collectOpenRouterSession. The runner and diff collector are injectable
 * so tests can drive deterministic outcomes via in-process http servers
 * or pure mocks.
 */
export async function runOpenRouter(
  root: string,
  missionPath: string,
  options: RunOpenRouterOptions = {},
): Promise<RunResult> {
  const plan = await planOpenRouterRun(root, missionPath, { extraRuntimeConfigOverrides: options.extraRuntimeConfigOverrides });
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
      runtime: "openrouter",
    });
    await persistPromptAndSession(artifacts, plan.prompt, {
      schema_version: "uh.runtime-session.v0",
      mission_id: plan.mission.id,
      runtime: "openrouter",
      status: "running",
      command: plan.command,
      args: plan.args,
      started_at: startedAt,
    });
    await appendMissionEvent(artifacts, {
      event: "runtime.started",
      timestamp: startedAt,
      runtime: "openrouter",
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
      runtime: "openrouter",
      mission_id: plan.mission.id,
      mission_name: plan.mission.name,
      workflow: plan.mission.workflow_profile,
      run_id: runId,
    });
    await appendFile(logPath, `${auditEntry}\n`, "utf-8");
  } catch {
    // audit failure shouldn't block run
  }

  const runner = options.runner ?? defaultOpenRouterRunner;
  let runnerResult: OpenRouterRunnerOutput;
  let collection: OpenRouterCollectOutput;
  try {
    runnerResult = await runner({
      endpoint: plan.endpoint,
      headers: plan.headers,
      body: plan.body,
      cwd: root,
      timeoutMs: options.timeoutMs ?? plan.requestTimeoutMs,
    });

    const collectDiff = options.collectDiff ?? defaultDiffCollector;
    const diff = await collectDiff(root);
    const finishedAt = new Date().toISOString();

    collection = await collectOpenRouterSession({
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
    const terminalStatus = deriveOpenRouterRunStatus(collection.result, collection.exitCode);
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
      runtime: "openrouter",
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

function deriveOpenRouterRunStatus(
  result: RuntimeResultDocument | undefined,
  exitCode: number,
): RunStatus {
  if (result?.status) return result.status;
  return exitCode === 0 ? "blocked" : "failed";
}

// ---------- collector ----------

/**
 * Persist a completed openrouter session and classify the
 * RuntimeResultStatus. Mirrors `collectHermesSession` /
 * `collectOhMyPiSession` shape. Classification table:
 *
 *  network ECONNREFUSED       -> blocked ("network unreachable or endpoint misconfigured")
 *  network ETIMEDOUT          -> blocked
 *  timedOut (AbortController) -> failed
 *  errorEnvelope auth_failed  -> blocked  ("check OPENROUTER_API_KEY")
 *  http 401 / 403             -> blocked
 *  http 404 + model_not_found -> blocked
 *  http 4xx/5xx               -> failed
 *  exitCode != 0              -> failed
 *  200 + empty content        -> failed
 *  200 + content + sentinel   -> passed; runtime-final.txt = sentinel
 *  200 + content (no sentinel) -> passed; runtime-final.txt = "" (matches
 *                                 oh-my-pi behaviour)
 */
export async function collectOpenRouterSession(
  input: OpenRouterCollectInput,
): Promise<OpenRouterCollectOutput> {
  const { artifacts, plan, runnerResult, diff, startedAt, finishedAt, root } = input;

  const errors: string[] = [];
  let stderr = runnerResult.stderr;
  let exitCode = runnerResult.exitCode;

  if (runnerResult.timedOut) {
    errors.push(`openrouter: request timed out after ${plan.requestTimeoutMs} ms`);
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
        event: "openrouter.sse",
        timestamp: new Date().toISOString(),
        payload: event,
      });
    }

    const draft: RuntimeResultDocument = {
      schema_version: "uh.runtime-result.v0",
      mission_id: plan.mission.id,
      runtime: "openrouter",
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

    const proxyUsage =
      usageFromOpenAI(runnerResult.usage, runnerResult.usageModel) ??
      estimateUsage(plan.prompt, sentinel);
    await appendMissionEvent(
      artifacts,
      buildUsageEvent("openrouter", plan.mission.id, proxyUsage, finishedAt),
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
  runner: OpenRouterRunnerOutput,
  plan: OpenRouterRunPlan,
  errors: string[],
): RuntimeResultStatus {
  // Network-level failure first; the proxy may simply not be running.
  if (runner.networkError) {
    if (/ECONNREFUSED/.test(runner.networkError)) {
      errors.push(`openrouter: endpoint unreachable: ${plan.endpoint} (network unreachable or endpoint misconfigured)`);
      return "blocked";
    }
    if (/ETIMEDOUT/.test(runner.networkError) || /ENETUNREACH/.test(runner.networkError)) {
      errors.push(`openrouter: network error: ${runner.networkError}`);
      return "blocked";
    }
    errors.push(`openrouter: network error: ${runner.networkError}`);
    return "failed";
  }

  if (runner.timedOut) {
    return "failed";
  }

  const envelope = runner.errorEnvelope;
  if (envelope && /upstream_auth_failed|invalid_api_key|authentication/i.test(`${envelope.type ?? ""} ${envelope.code ?? ""} ${envelope.message}`)) {
    errors.push(`openrouter: upstream auth failed: ${envelope.message} (check OPENROUTER_API_KEY)`);
    return "blocked";
  }

  const status = runner.httpStatus;
  if (typeof status === "number") {
    if (status === 401 || status === 403) {
      errors.push(
        `openrouter: HTTP ${status}: ${envelope?.message ?? "auth required"} (check OPENROUTER_API_KEY)`,
      );
      return "blocked";
    }
    if (status === 404 && envelope && /model/i.test(`${envelope.message} ${envelope.code ?? ""}`)) {
      errors.push(`openrouter: model "${plan.body.model}" not available on openrouter: ${envelope.message}`);
      return "blocked";
    }
    if (status >= 400) {
      errors.push(`openrouter: HTTP ${status}: ${envelope?.message ?? "request failed"}`);
      return "failed";
    }
  }

  if (runner.exitCode !== 0) {
    if (runner.stdout.length === 0) {
      errors.push("openrouter: empty assistant message");
    }
    return "failed";
  }

  if (runner.stdout.trim().length === 0) {
    errors.push("openrouter: empty assistant message");
    return "failed";
  }

  return "passed";
}

async function persistFinalRuntimeSession(
  artifacts: MissionArtifactContext,
  plan: OpenRouterRunPlan,
  startedAt: string,
  finishedAt: string,
  exitCode: number,
  sessionStatus: "succeeded" | "failed",
): Promise<void> {
  await persistPromptAndSession(artifacts, plan.prompt, {
    schema_version: "uh.runtime-session.v0",
    mission_id: plan.mission.id,
    runtime: "openrouter",
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
    runtime: "openrouter",
    mission_id: plan.mission.id,
    exit_code: exitCode,
    status: sessionStatus,
  });
}
