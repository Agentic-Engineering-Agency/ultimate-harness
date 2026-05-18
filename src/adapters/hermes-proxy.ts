import { z } from "zod";
import { readFile, writeFile, appendFile, lstat } from "node:fs/promises";
import { parse, stringify } from "yaml";
import path from "node:path";
import { AdapterDocument, registerRuntimeConfigSchema } from "../schema/adapter.js";
import { MissionDocument, validateMission } from "../schema/mission.js";
import { validateWorkflow, WorkflowDocument } from "../schema/workflow.js";
import { auditLog, workflowsDir } from "../harness/paths.js";
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
import {
  extractRuntimeFinalMessageSentinel,
  runtimeFinalMessageInstruction,
} from "../harness/runtime-final-message.js";

/**
 * hermes-proxy runtime adapter — UH-32 / UH-35 / UH-39.
 *
 * HTTP client targeting a local `hermes proxy` instance (Hermes Agent ≥ 0.14.0).
 * Officially sanctioned OAuth-backed subscription routing — replaces the OMP
 * stealth path. v0.14.0 ships only the `nous` upstream provider; future Hermes
 * versions may add claude/chatgpt/supergrok. The adapter stays
 * provider-agnostic: it speaks OpenAI-compat HTTP to `endpoint` and lets the
 * proxy handle the upstream credential attach.
 *
 * Wire reference: docs/architecture/hermes-proxy-spike.md.
 */

// ---------- schema (UH-35; do not touch without coordinating a downstream slice) ----------

/**
 * Strict Zod schema for `.harness/adapters/hermes-proxy.yaml` →
 * `config.runtime_config`. Strict so typos at adapter-load or mission-override
 * time raise a Zod error instead of being silently dropped.
 */
export const HermesProxyRuntimeConfigSchema = z
  .object({
    endpoint: z.string().url(),
    model: z.string().min(1),
    provider: z.enum(["nous", "claude", "chatgpt", "supergrok"]).optional(),
    request_timeout_ms: z.number().int().positive().optional().default(120_000),
    extra_headers: z.record(z.string(), z.string()).optional().default({}),
  })
  .strict();
export type HermesProxyRuntimeConfig = z.infer<typeof HermesProxyRuntimeConfigSchema>;
registerRuntimeConfigSchema("hermes-proxy", HermesProxyRuntimeConfigSchema);

/**
 * Live runtime checker (UH-37). Hits `GET <endpoint>/models` against the
 * configured proxy, with a tight timeout. Maps the response to the
 * AdapterCheckResult shape:
 *
 *  - 200 with JSON `{ data: [...] }`     → found, version: "<n> models available"
 *  - 401 / 403                            → not found, errors: re-auth hint
 *  - 404 / path_not_allowed               → not found, errors: proxy version mismatch
 *  - ECONNREFUSED / network unreachable   → not found, errors: "proxy not running"
 *  - timeout                              → not found, errors: "adapter check timed out"
 *  - other 4xx / 5xx                      → not found, errors: verbatim
 */
export const HERMES_PROXY_CHECK_TIMEOUT_MS = 5_000;

export const hermesProxyRuntimeChecker: AdapterRuntimeChecker = async (manifest): Promise<AdapterCheckResult> => {
  const rc = manifest.config?.runtime_config as Record<string, unknown> | undefined;
  const endpoint = typeof rc?.endpoint === "string" ? rc.endpoint : "";
  if (endpoint.length === 0) {
    return {
      runtime: "hermes-proxy",
      found: false,
      version: "",
      errors: ["hermes-proxy: missing endpoint in runtime_config"],
    };
  }
  const provider = typeof rc?.provider === "string" ? rc.provider : "";
  const providerHint = provider.length > 0 ? ` (run \`hermes auth status ${provider}\` to re-auth)` : " (run `hermes auth status <provider>` to re-auth)";
  const url = `${endpoint.replace(/\/$/, "")}/models`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HERMES_PROXY_CHECK_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { authorization: "Bearer hermes-proxy" },
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const message = (err as Error).message ?? String(err);
    const cause = (err as { cause?: { code?: string } }).cause;
    const code = cause?.code;
    if (controller.signal.aborted) {
      return {
        runtime: "hermes-proxy",
        found: false,
        version: "",
        errors: [`hermes-proxy: adapter check timed out after ${HERMES_PROXY_CHECK_TIMEOUT_MS} ms`],
      };
    }
    if (code === "ECONNREFUSED" || /ECONNREFUSED|fetch failed/i.test(message)) {
      return {
        runtime: "hermes-proxy",
        found: false,
        version: "",
        errors: [`hermes-proxy: endpoint unreachable: ${endpoint} (is \`hermes proxy start\` running?)`],
      };
    }
    return {
      runtime: "hermes-proxy",
      found: false,
      version: "",
      errors: [`hermes-proxy: network error: ${code ? `${code}: ${message}` : message}`],
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
      runtime: "hermes-proxy",
      found: false,
      version: "",
      errors: [`hermes-proxy: HTTP ${response.status} from proxy${detail}${providerHint}`],
    };
  }

  if (response.status === 404) {
    const envelope = safeJsonEnvelope(bodyText);
    const detail = envelope ? `: ${envelope.message}` : "";
    return {
      runtime: "hermes-proxy",
      found: false,
      version: "",
      errors: [`hermes-proxy: HTTP 404${detail} (proxy version may not forward /models)`],
    };
  }

  if (!response.ok) {
    const envelope = safeJsonEnvelope(bodyText);
    const detail = envelope ? `: ${envelope.message}` : ` (body: ${bodyText.slice(0, 200)})`;
    return {
      runtime: "hermes-proxy",
      found: false,
      version: "",
      errors: [`hermes-proxy: HTTP ${response.status}${detail}`],
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
    runtime: "hermes-proxy",
    found: true,
    version: modelCount > 0
      ? `proxy reachable at ${endpoint} (${modelCount} models available)`
      : `proxy reachable at ${endpoint}`,
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
runtimeRegistry.register("hermes-proxy", hermesProxyRuntimeChecker);

// ---------- types ----------

type MissionArtifactContext = {
  missionDir: string;
  promptPath: string;
  runtimeSessionPath: string;
  eventsPath: string;
  stdoutPath: string;
  stderrPath: string;
  diffPath: string;
  runtimeResultPath: string;
  finalMessagePath: string;
};

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
};

export type HermesProxyRunPlan = {
  command: string;
  args: string[];
  prompt: string;
  worktree: boolean;
  session_id_passthrough: boolean;
  errors: string[];
  mission: MissionDocument;
  endpoint: string;
  headers: Record<string, string>;
  body: HermesProxyRequestBody;
  requestTimeoutMs: number;
};

export interface HermesProxyRequestBody {
  model: string;
  messages: Array<{ role: "user" | "system" | "assistant"; content: string }>;
  stream: boolean;
}

export interface HermesProxyRunnerInput {
  endpoint: string;
  headers: Record<string, string>;
  body: HermesProxyRequestBody;
  cwd: string;
  timeoutMs: number;
}

export interface HermesProxyRunnerOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
  httpStatus?: number;
  errorEnvelope?: { message: string; type?: string; code?: string };
  networkError?: string;
  timedOut: boolean;
  events: Array<Record<string, unknown>>;
}

export type HermesProxyRunner = (input: HermesProxyRunnerInput) => Promise<HermesProxyRunnerOutput>;

export interface DiffCaptureResult {
  patch: string;
  errors?: string[];
}

export type DiffCollector = (cwd: string) => Promise<DiffCaptureResult>;

export interface RunHermesProxyOptions {
  runner?: HermesProxyRunner;
  collectDiff?: DiffCollector;
  timeoutMs?: number;
}

export interface HermesProxyCollectInput {
  root: string;
  artifacts: MissionArtifactContext | null;
  plan: HermesProxyRunPlan;
  startedAt: string;
  finishedAt: string;
  runnerResult: HermesProxyRunnerOutput;
  diff: DiffCaptureResult;
}

export interface HermesProxyCollectOutput {
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
 * Default placeholder bearer value. The hermes-proxy *requires* an
 * `Authorization: Bearer …` header but ignores its value (the proxy attaches
 * its own credentials downstream). Sending a constant placeholder keeps the
 * adapter testable and lets operators see exactly what shape went on the wire.
 */
const DEFAULT_AUTH_PLACEHOLDER = "hermes-proxy";

/**
 * Compile a mission into the HTTP request plan the runner will dispatch.
 * Throws when the mission or adapter manifest cannot be loaded; recoverable
 * issues (missing workflow profile) are surfaced in `plan.errors[]`.
 */
export async function planHermesProxyRun(root: string, missionPath: string): Promise<HermesProxyRunPlan> {
  const errors: string[] = [];
  const adapter = await loadAdapterConfig(root, "hermes-proxy");

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
  const mergedRuntimeConfig = {
    ...(adapter.config?.runtime_config ?? {}),
    ...mission.runtime_config_overrides,
  };
  let runtimeConfig: HermesProxyRuntimeConfig;
  try {
    runtimeConfig = HermesProxyRuntimeConfigSchema.parse(mergedRuntimeConfig);
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

  const prompt = buildMissionPrompt(mission, workflow);

  const body: HermesProxyRequestBody = {
    model: runtimeConfig.model,
    messages: [{ role: "user", content: prompt }],
    stream: true,
  };

  // Build headers. extra_headers wins for forward-compat; the adapter
  // ALWAYS sets content-type and authorization. Header keys are normalized
  // to lower-case so duplicates don't slip in.
  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${DEFAULT_AUTH_PLACEHOLDER}`,
  };
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
 * RuntimeResultStatus via `collectHermesProxySession`.
 */
export const defaultHermesProxyRunner: HermesProxyRunner = async (input) => {
  const out: HermesProxyRunnerOutput = {
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
      out.stderr = "hermes-proxy: response had no readable body\n";
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
        out.stderr += `hermes-proxy: request timed out after ${input.timeoutMs} ms\n`;
      } else {
        const message = (err as Error).message ?? String(err);
        out.stderr += `hermes-proxy stream read error: ${message}\n`;
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
        if (out.stdout.length === 0) {
          out.stderr = "hermes-proxy: empty assistant message\n";
          out.exitCode = 1;
        }
      } else {
        const envelope = extractErrorEnvelope(parsed);
        if (envelope) out.errorEnvelope = envelope;
        out.stderr = bodyText;
        out.exitCode = 1;
      }
    } catch (err) {
      out.stderr = `hermes-proxy: invalid JSON response: ${(err as Error).message}\nbody: ${bodyText}\n`;
      out.exitCode = 1;
    }
  } else {
    // Plain text / HTML / nothing useful — surface verbatim.
    out.stderr = bodyText;
    out.exitCode = response.ok ? 0 : 1;
  }

  return out;
};

function handleSseFrame(rawFrame: string, out: HermesProxyRunnerOutput): "DONE" | "OK" {
  const trimmed = rawFrame.trim();
  if (trimmed.length === 0) return "OK";
  for (const line of trimmed.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (data === "[DONE]") return "DONE";
    try {
      const parsed = JSON.parse(data) as Record<string, unknown>;
      out.events.push(parsed);
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
      out.stderr += `hermes-proxy SSE parse error: ${(err as Error).message}\nframe: ${data}\n`;
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
export function parseHermesProxyStream(buffer: string): {
  content: string;
  events: Array<Record<string, unknown>>;
  errorEnvelope: { message: string; type?: string; code?: string } | null;
} {
  const out: HermesProxyRunnerOutput = {
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

export async function dryRunHermesProxy(root: string, missionPath: string): Promise<DryRunResult> {
  try {
    const plan = await planHermesProxyRun(root, missionPath);
    const artifacts = await getMissionArtifactContext(root, missionPath);
    if (artifacts) {
      await persistPromptAndSession(artifacts, plan.prompt, {
        schema_version: "uh.runtime-session.v0",
        mission_id: plan.mission.id,
        runtime: "hermes-proxy",
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
 * Execute a mission against the hermes-proxy runtime end-to-end.
 *
 * Orchestrates: planHermesProxyRun -> writeable artifact context ->
 * runtime.started audit -> runner invocation -> diff capture ->
 * collectHermesProxySession. The runner and diff collector are injectable
 * so tests can drive deterministic outcomes via in-process http servers
 * or pure mocks.
 */
export async function runHermesProxy(
  root: string,
  missionPath: string,
  options: RunHermesProxyOptions = {},
): Promise<RunResult> {
  const plan = await planHermesProxyRun(root, missionPath);
  if (plan.errors.length > 0) {
    throw new Error(plan.errors.join("; "));
  }

  const artifacts = await getMissionArtifactContext(root, missionPath);
  const startedAt = new Date().toISOString();

  if (artifacts) {
    await persistPromptAndSession(artifacts, plan.prompt, {
      schema_version: "uh.runtime-session.v0",
      mission_id: plan.mission.id,
      runtime: "hermes-proxy",
      status: "running",
      command: plan.command,
      args: plan.args,
      started_at: startedAt,
    });
    await appendMissionEvent(artifacts, {
      event: "runtime.started",
      timestamp: startedAt,
      runtime: "hermes-proxy",
      mission_id: plan.mission.id,
      command: plan.command,
      args: plan.args,
    });
  }

  try {
    const logPath = auditLog(root);
    const auditEntry = JSON.stringify({
      event: "mission.run",
      timestamp: new Date().toISOString(),
      runtime: "hermes-proxy",
      mission_id: plan.mission.id,
      mission_name: plan.mission.name,
      workflow: plan.mission.workflow_profile,
    });
    await appendFile(logPath, `${auditEntry}\n`, "utf-8");
  } catch {
    // audit failure shouldn't block run
  }

  const runner = options.runner ?? defaultHermesProxyRunner;
  const runnerResult = await runner({
    endpoint: plan.endpoint,
    headers: plan.headers,
    body: plan.body,
    cwd: root,
    timeoutMs: options.timeoutMs ?? plan.requestTimeoutMs,
  });

  const collectDiff = options.collectDiff ?? defaultDiffCollector;
  const diff = await collectDiff(root);
  const finishedAt = new Date().toISOString();

  const collection = await collectHermesProxySession({
    root,
    artifacts,
    plan,
    startedAt,
    finishedAt,
    runnerResult,
    diff,
  });

  return {
    exitCode: collection.exitCode,
    stdout: runnerResult.stdout,
    stderr: collection.stderr,
    result: collection.result,
  };
}

// ---------- collector ----------

/**
 * Persist a completed hermes-proxy session and classify the
 * RuntimeResultStatus. Mirrors `collectHermesSession` /
 * `collectOhMyPiSession` shape. Classification table:
 *
 *  network ECONNREFUSED       -> blocked ("is `hermes proxy start` running?")
 *  network ETIMEDOUT          -> blocked
 *  timedOut (AbortController) -> failed
 *  errorEnvelope auth_failed  -> blocked  ("hermes auth status <provider>")
 *  http 401 / 403             -> blocked
 *  http 404 + model_not_found -> blocked
 *  http 4xx/5xx               -> failed
 *  exitCode != 0              -> failed
 *  200 + empty content        -> failed
 *  200 + content + sentinel   -> passed; runtime-final.txt = sentinel
 *  200 + content (no sentinel) -> passed; runtime-final.txt = "" (matches
 *                                 oh-my-pi behaviour)
 */
export async function collectHermesProxySession(
  input: HermesProxyCollectInput,
): Promise<HermesProxyCollectOutput> {
  const { artifacts, plan, runnerResult, diff, startedAt, finishedAt, root } = input;

  const errors: string[] = [];
  let stderr = runnerResult.stderr;
  let exitCode = runnerResult.exitCode;

  if (runnerResult.timedOut) {
    errors.push(`hermes-proxy: request timed out after ${plan.requestTimeoutMs} ms`);
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
        event: "hermes-proxy.sse",
        timestamp: new Date().toISOString(),
        payload: event,
      });
    }

    const draft: RuntimeResultDocument = {
      schema_version: "uh.runtime-result.v0",
      mission_id: plan.mission.id,
      runtime: "hermes-proxy",
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
  } catch (err) {
    const message = (err as Error).message;
    const separator = stderr && !stderr.endsWith("\n") ? "\n" : "";
    stderr = `${stderr}${separator}Artifact persistence failure: ${message}`;
    return { exitCode: exitCode === 0 ? 1 : exitCode, stderr };
  }

  return { exitCode, stderr, result };
}

function classifyStatus(
  runner: HermesProxyRunnerOutput,
  plan: HermesProxyRunPlan,
  errors: string[],
): RuntimeResultStatus {
  // Network-level failure first; the proxy may simply not be running.
  if (runner.networkError) {
    if (/ECONNREFUSED/.test(runner.networkError)) {
      errors.push(`hermes-proxy: endpoint unreachable: ${plan.endpoint} (is \`hermes proxy start\` running?)`);
      return "blocked";
    }
    if (/ETIMEDOUT/.test(runner.networkError) || /ENETUNREACH/.test(runner.networkError)) {
      errors.push(`hermes-proxy: network error: ${runner.networkError}`);
      return "blocked";
    }
    errors.push(`hermes-proxy: network error: ${runner.networkError}`);
    return "failed";
  }

  if (runner.timedOut) {
    return "failed";
  }

  const envelope = runner.errorEnvelope;
  const providerHint = plan.body.model ? "" : "";
  const provider = plan.headers["x-provider"] ?? "";
  void providerHint;
  void provider;

  if (envelope && /upstream_auth_failed|invalid_api_key|authentication/i.test(`${envelope.type ?? ""} ${envelope.code ?? ""} ${envelope.message}`)) {
    const provHint = plan.endpoint ? ` (run \`hermes auth status <provider>\` to re-auth)` : "";
    errors.push(`hermes-proxy: upstream auth failed: ${envelope.message}${provHint}`);
    return "blocked";
  }

  const status = runner.httpStatus;
  if (typeof status === "number") {
    if (status === 401 || status === 403) {
      errors.push(
        `hermes-proxy: HTTP ${status} from proxy: ${envelope?.message ?? "auth required"} (run \`hermes auth status <provider>\` to re-auth)`,
      );
      return "blocked";
    }
    if (status === 404 && envelope && /model/i.test(`${envelope.message} ${envelope.code ?? ""}`)) {
      errors.push(`hermes-proxy: model "${plan.body.model}" not available on this proxy: ${envelope.message}`);
      return "blocked";
    }
    if (status >= 400) {
      errors.push(`hermes-proxy: HTTP ${status}: ${envelope?.message ?? "request failed"}`);
      return "failed";
    }
  }

  if (runner.exitCode !== 0) {
    if (runner.stdout.length === 0) {
      errors.push("hermes-proxy: empty assistant message");
    }
    return "failed";
  }

  if (runner.stdout.trim().length === 0) {
    errors.push("hermes-proxy: empty assistant message");
    return "failed";
  }

  return "passed";
}

// ---------- mission-artifact helpers (duplicated from hermes.ts / oh-my-pi.ts pattern) ----------

async function getMissionArtifactContext(root: string, missionPath: string): Promise<MissionArtifactContext | null> {
  const rootResolved = path.resolve(root);
  const missionsRoot = path.join(rootResolved, ".harness", "missions");
  const resolvedMissionPath = path.isAbsolute(missionPath)
    ? path.resolve(missionPath)
    : path.resolve(rootResolved, missionPath);
  const relative = path.relative(missionsRoot, resolvedMissionPath);
  const parts = relative.split(path.sep);

  if (relative.startsWith("..") || path.isAbsolute(relative) || parts.length !== 2 || parts[1] !== "mission.yaml" || !parts[0]) {
    return null;
  }

  const harnessDir = path.join(rootResolved, ".harness");
  const harnessStat = await lstat(harnessDir);
  if (harnessStat.isSymbolicLink()) {
    throw new Error(`Refusing to persist artifacts through symlinked .harness directory: ${harnessDir}`);
  }
  if (!harnessStat.isDirectory()) {
    throw new Error(`Refusing to persist artifacts through non-directory .harness path: ${harnessDir}`);
  }

  const missionsRootStat = await lstat(missionsRoot);
  if (missionsRootStat.isSymbolicLink()) {
    throw new Error(`Refusing to persist artifacts through symlinked missions directory: ${missionsRoot}`);
  }
  if (!missionsRootStat.isDirectory()) {
    throw new Error(`Refusing to persist artifacts through non-directory missions path: ${missionsRoot}`);
  }

  const missionDir = path.join(missionsRoot, parts[0]);
  const missionDirStat = await lstat(missionDir);
  if (missionDirStat.isSymbolicLink()) {
    throw new Error(`Refusing to persist artifacts into symlinked mission directory: ${missionDir}`);
  }
  if (!missionDirStat.isDirectory()) {
    throw new Error(`Refusing to persist artifacts into non-directory mission path: ${missionDir}`);
  }

  const context: MissionArtifactContext = {
    missionDir,
    promptPath: path.join(missionDir, "prompt.md"),
    runtimeSessionPath: path.join(missionDir, "runtime-session.yaml"),
    eventsPath: path.join(missionDir, "events.ndjson"),
    stdoutPath: path.join(missionDir, "runtime.stdout.log"),
    stderrPath: path.join(missionDir, "runtime.stderr.log"),
    diffPath: path.join(missionDir, "diff.patch"),
    runtimeResultPath: path.join(missionDir, "runtime-result.yaml"),
    finalMessagePath: path.join(missionDir, "runtime-final.txt"),
  };

  for (const artifactPath of [
    context.promptPath,
    context.runtimeSessionPath,
    context.eventsPath,
    context.stdoutPath,
    context.stderrPath,
    context.diffPath,
    context.runtimeResultPath,
    context.finalMessagePath,
  ]) {
    assertPathInsideMissionDir(missionDir, artifactPath);
  }

  return context;
}

async function assertWritableArtifact(missionDir: string, artifactPath: string): Promise<void> {
  assertPathInsideMissionDir(missionDir, artifactPath);
  try {
    const stat = await lstat(artifactPath);
    if (stat.isSymbolicLink()) {
      throw new Error(`Refusing to overwrite symlinked artifact: ${artifactPath}`);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }
}

function assertPathInsideMissionDir(missionDir: string, artifactPath: string): void {
  const relative = path.relative(missionDir, path.resolve(artifactPath));
  if (relative.startsWith("..") || path.isAbsolute(relative) || relative === "") {
    throw new Error(`Refusing to write artifact outside mission directory: ${artifactPath}`);
  }
}

async function writeArtifactFile(missionDir: string, artifactPath: string, content: string): Promise<void> {
  await assertWritableArtifact(missionDir, artifactPath);
  await writeFile(artifactPath, content, "utf-8");
}

async function persistPromptAndSession(
  artifacts: MissionArtifactContext,
  prompt: string,
  session: RuntimeSessionDocument,
): Promise<void> {
  await writeArtifactFile(artifacts.missionDir, artifacts.promptPath, prompt);
  await writeArtifactFile(artifacts.missionDir, artifacts.runtimeSessionPath, stringify(session));
}

async function appendMissionEvent(artifacts: MissionArtifactContext, event: Record<string, unknown>): Promise<void> {
  await assertWritableArtifact(artifacts.missionDir, artifacts.eventsPath);
  await appendFile(artifacts.eventsPath, `${JSON.stringify(event)}\n`, "utf-8");
}

async function persistFinalRuntimeSession(
  artifacts: MissionArtifactContext,
  plan: HermesProxyRunPlan,
  startedAt: string,
  finishedAt: string,
  exitCode: number,
  sessionStatus: "succeeded" | "failed",
): Promise<void> {
  await persistPromptAndSession(artifacts, plan.prompt, {
    schema_version: "uh.runtime-session.v0",
    mission_id: plan.mission.id,
    runtime: "hermes-proxy",
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
    runtime: "hermes-proxy",
    mission_id: plan.mission.id,
    exit_code: exitCode,
    status: sessionStatus,
  });
}

function buildMissionPrompt(
  mission: MissionDocument,
  workflow: WorkflowDocument | undefined,
): string {
  let prompt = `# Mission: ${mission.name}\n\n`;
  prompt += `${mission.description}\n\n`;

  if (workflow) {
    prompt += `## Workflow: ${workflow.name}\n\n`;
    for (const phase of workflow.phases) {
      prompt += `### ${phase.name} (${phase.agent_role})\n${phase.description}\n\n`;
    }
  }

  if (mission.issues.length > 0) {
    prompt += "## Related Issues\n";
    for (const issue of mission.issues) {
      prompt += `- [${issue.source}] ${issue.reference}`;
      if (issue.url) prompt += ` (${issue.url})`;
      prompt += "\n";
    }
    prompt += "\n";
  }

  if (mission.read_first.length > 0) {
    prompt += "## Read First\n";
    for (const p of mission.read_first) {
      prompt += `- ${p}\n`;
    }
    prompt += "\n";
  }

  if (mission.expected_artifacts.length > 0) {
    prompt += "## Expected Artifacts\n";
    for (const a of mission.expected_artifacts) {
      prompt += `- ${a.path}`;
      if (a.type) prompt += ` (${a.type})`;
      prompt += "\n";
    }
    prompt += "\n";
  }

  if (mission.verification.checks.length > 0) {
    prompt += "## Verification Checks\n";
    for (const c of mission.verification.checks) {
      prompt += `- ${c}\n`;
    }
    prompt += "\n";
  }

  prompt += "Execute this mission and produce the expected artifacts.\n";
  prompt += runtimeFinalMessageInstruction();

  return prompt;
}
