import { execFile, spawn, type ChildProcess } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { parse, stringify } from "yaml";
import { validateMission } from "../schema/mission.js";
import { validateWorkflow } from "../schema/workflow.js";
import { runtimeRegistry } from "../harness/registry.js";
import { resolveRuntimeCommand } from "../harness/runtime-command.js";
import {
  AcpRuntimeConfigSchema,
  AcpInitializeResultSchema,
  AcpSessionNewResultSchema,
  AcpSessionPromptResultSchema,
  AcpSessionUpdateSchema,
  AcpContentBlockSchema,
  AcpClientInfoSchema,
  AcpJsonRpcRequestSchema,
  AcpJsonRpcNotificationSchema,
  AcpJsonRpcResponseSchema,
  type AcpRuntimeConfig,
  type AcpInitializeResult,
  type AcpSessionNewResult,
  type AcpSessionPromptResult,
} from "../schema/acp.js";
import { registerRuntimeConfigSchema } from "../schema/adapter.js";
import { renderPrompt } from "../harness/render-prompt.js";
import { buildDispatchContext } from "../harness/dispatch-context.js";
import { mergeRuntimeConfigOverrides } from "../harness/runtime-config-overrides.js";
import { claimRuntimeAttempt } from "../harness/runtime-attempt.js";
import { extractRuntimeFinalMessageSentinel } from "../harness/runtime-final-message.js";
import { relativeArtifactPath } from "../harness/artifact-paths.js";
import {
  appendRunsIndexEntry,
  generateRunId,
  mirrorRuntimeResultToLatest,
  writeLatestPointer,
} from "../harness/run-id.js";
import { captureDiffWithUntracked } from "../harness/diff-capture.js";
import {
  validateRuntimeResult,
  type RuntimeResultDocument,
  type RuntimeResultStatus,
} from "../schema/artifacts.js";
import type { RuntimeUsage } from "../harness/usage.js";
import {
  appendMissionEvent,
  getMissionArtifactContext,
  persistPromptAndSession,
  writeArtifactFile,
} from "./_artifact-context.js";

const execFileAsync = promisify(execFile);

registerRuntimeConfigSchema("acp", AcpRuntimeConfigSchema);

/** Client identity advertised during ACP `initialize`. */
export const ACP_CLIENT_NAME = "ultimate-harness";
export const ACP_CLIENT_VERSION = "0.11.0";

const JSONRPC_METHOD_NOT_FOUND = -32601;
const JSONRPC_INTERNAL_ERROR = -32603;

/** Outcome of an agent→client `session/request_permission` request. */
type AcpPermissionOutcome = { outcome: "selected"; optionId: string } | { outcome: "cancelled" };

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  method: string;
  timer?: NodeJS.Timeout;
};

export interface AcpClientOptions {
  /** Per-request timeout in milliseconds; `0` disables the timer. */
  timeoutMs?: number;
  cancellationSignal?: AbortSignal;
  /** Called for every inbound notification (method with no id). */
  onNotification?: (method: string, params: Record<string, unknown>) => void;
  /** Called for every inbound agent→client request. Return a result, or `undefined` to fall back. */
  onServerRequest?: (method: string, params: Record<string, unknown>) => unknown | Promise<unknown>;
  /** Called for every parsed inbound JSON-RPC message (transcript capture). */
  onMessage?: (message: Record<string, unknown>) => void;
  /** Called with raw stderr chunks from the agent process. */
  onStderr?: (chunk: string) => void;
}

/**
 * JSON-RPC 2.0 stdio client for ACP agent servers.
 *
 * Owns framing (partial-buffer reassembly), request/response correlation with
 * per-request timeouts, cancellation, and — critically — answering the agent's
 * own requests so a compliant agent never blocks on a permission or filesystem
 * prompt. The transport is injectable via subclassing (`writeMessage`,
 * `start`, `stop`) so the framing and lifecycle can be unit-tested without a
 * real server process.
 */
export class AcpClient {
  protected child: ChildProcess | null = null;
  /** True once `start()` has wired the transport; overridable for tests. */
  protected connected = false;
  private requestId = 1;
  private pending = new Map<number, PendingRequest>();
  private buffer = "";
  private stopped = false;
  protected readonly timeoutMs: number;
  protected readonly cancellationSignal?: AbortSignal;
  protected readonly onMessageHandler?: (message: Record<string, unknown>) => void;
  protected readonly onStderrHandler?: (chunk: string) => void;
  protected onNotificationHandler?: (method: string, params: Record<string, unknown>) => void;
  protected onServerRequestHandler?: (method: string, params: Record<string, unknown>) => unknown | Promise<unknown>;
  protected abortListener?: () => void;

  constructor(
    private command: string,
    private args: string[],
    private cwd: string,
    private env: NodeJS.ProcessEnv = process.env,
    options: AcpClientOptions = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? 600_000;
    this.cancellationSignal = options.cancellationSignal;
    this.onNotificationHandler = options.onNotification;
    this.onServerRequestHandler = options.onServerRequest;
    this.onMessageHandler = options.onMessage;
    this.onStderrHandler = options.onStderr;
  }

  public onNotification(handler: (method: string, params: Record<string, unknown>) => void): void {
    this.onNotificationHandler = handler;
  }

  public onServerRequest(
    handler: (method: string, params: Record<string, unknown>) => unknown | Promise<unknown>,
  ): void {
    this.onServerRequestHandler = handler;
  }

  public isRunning(): boolean {
    return this.connected;
  }

  public async start(): Promise<void> {
    this.child = spawn(this.command, this.args, {
      cwd: this.cwd,
      env: this.env,
      stdio: ["pipe", "pipe", "pipe"],
      // A process group leader on POSIX lets us signal the whole tree.
      detached: process.platform !== "win32",
      windowsHide: true,
    });
    this.connected = true;

    this.child.stdout?.on("data", (chunk: Buffer) => this.handleChunk(chunk));
    this.child.stderr?.on("data", (chunk: Buffer) => this.onStderrHandler?.(chunk.toString("utf8")));

    this.child.on("error", (error) => {
      this.connected = false;
      this.rejectAll(error);
    });
    this.child.on("exit", (code, signal) => {
      this.connected = false;
      if (!this.stopped) {
        this.rejectAll(new Error(`ACP server process exited prematurely with code ${code ?? signal ?? "unknown"}`));
      }
    });

    if (this.cancellationSignal) {
      this.abortListener = () => {
        this.rejectAll(new Error("ACP client cancelled"));
      };
      if (this.cancellationSignal.aborted) this.abortListener();
      else this.cancellationSignal.addEventListener("abort", this.abortListener, { once: true });
    }
  }

  /** Feed raw bytes from the server; reassembles partial lines. Public for testing. */
  public handleChunk(chunk: Buffer | string): void {
    this.buffer += chunk.toString("utf8");
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) this.dispatchLine(trimmed);
    }
  }

  private dispatchLine(line: string): void {
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      // Non-JSON or truncated framing is not fatal; the agent may recover.
      return;
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
    const message = raw as Record<string, unknown>;
    this.onMessageHandler?.(message);

    // Agent→client request: has both a method and an id.
    const request = AcpJsonRpcRequestSchema.safeParse(message);
    if (request.success) {
      void this.handleServerRequest(request.data.id, request.data.method, request.data.params ?? {});
      return;
    }
    // Inbound notification: a method with no id.
    const notification = AcpJsonRpcNotificationSchema.safeParse(message);
    if (notification.success) {
      this.onNotificationHandler?.(notification.data.method, notification.data.params ?? {});
      return;
    }
    // Response to one of our requests.
    if (message.id !== undefined && message.id !== null) this.settleResponse(message.id as number | string, message);
  }

  private settleResponse(id: number | string, message: Record<string, unknown>): void {
    const entry = this.pending.get(id as number);
    if (!entry) return;
    this.pending.delete(id as number);
    if (entry.timer) clearTimeout(entry.timer);

    const parsed = AcpJsonRpcResponseSchema.safeParse(message);
    if (!parsed.success) {
      entry.reject(new Error(`ACP returned a malformed JSON-RPC response for ${entry.method}`));
      return;
    }
    if (parsed.data.error) {
      entry.reject(new Error(`ACP error ${parsed.data.error.code}: ${parsed.data.error.message}`));
      return;
    }
    entry.resolve(parsed.data.result);
  }

  private async handleServerRequest(id: number | string, method: string, params: Record<string, unknown>): Promise<void> {
    try {
      let result = this.onServerRequestHandler ? await this.onServerRequestHandler(method, params) : undefined;
      if (result === undefined) result = this.defaultServerResponse(method, params);
      if (result === undefined) {
        this.writeMessage({
          jsonrpc: "2.0",
          id,
          error: { code: JSONRPC_METHOD_NOT_FOUND, message: `Method not found: ${method}` },
        });
      } else {
        this.writeMessage({ jsonrpc: "2.0", id, result });
      }
    } catch (error) {
      this.writeMessage({
        jsonrpc: "2.0",
        id,
        error: { code: JSONRPC_INTERNAL_ERROR, message: (error as Error).message },
      });
    }
  }

  /**
   * Built-in answers for the agent→client requests a headless harness can
   * service. `session/request_permission` selects an auto-approvable option
   * when the agent offers one; everything else returns `undefined` so the
   * client replies `-32601` instead of leaving the agent blocked.
   */
  private defaultServerResponse(method: string, params: Record<string, unknown>): unknown {
    if (method === "session/request_permission") {
      const outcome = this.selectPermission(params);
      return { outcome };
    }
    return undefined;
  }

  private selectPermission(params: Record<string, unknown>): AcpPermissionOutcome {
    const options = Array.isArray(params.options) ? params.options : [];
    for (const option of options) {
      if (!option || typeof option !== "object") continue;
      const record = option as Record<string, unknown>;
      const kind = record.kind;
      if ((kind === "allow_once" || kind === "allow_always") && typeof record.optionId === "string") {
        return { outcome: "selected", optionId: record.optionId };
      }
    }
    return { outcome: "cancelled" };
  }

  public request<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    if (!this.connected) {
      return Promise.reject(new Error("ACP client is not running or stdin is closed"));
    }
    const id = this.requestId++;
    return new Promise<T>((resolve, reject) => {
      const entry: PendingRequest = { resolve: resolve as (value: unknown) => void, reject, method };
      if (this.timeoutMs > 0) {
        entry.timer = setTimeout(() => {
          if (this.pending.delete(id)) reject(new Error(`ACP ${method} request timed out after ${this.timeoutMs}ms`));
        }, this.timeoutMs);
        entry.timer.unref?.();
      }
      this.pending.set(id, entry);
      try {
        this.writeMessage({ jsonrpc: "2.0", id, method, params: params ?? {} });
      } catch (error) {
        this.pending.delete(id);
        if (entry.timer) clearTimeout(entry.timer);
        reject(error as Error);
      }
    });
  }

  /** Write one JSON-RPC message as a newline-delimited frame. Overridable for tests. */
  protected writeMessage(message: Record<string, unknown>): void {
    if (!this.child?.stdin || this.child.stdin.destroyed) {
      throw new Error("ACP client stdin is closed");
    }
    this.child.stdin.write(`${JSON.stringify(message)}\n`, "utf8");
  }

  protected rejectAll(error: Error): void {
    for (const entry of this.pending.values()) {
      if (entry.timer) clearTimeout(entry.timer);
      entry.reject(error);
    }
    this.pending.clear();
  }

  /** Stop the client and terminate the agent process tree (SIGTERM → SIGKILL). */
  public async stop(): Promise<void> {
    this.stopped = true;
    this.connected = false;
    if (this.abortListener && this.cancellationSignal) {
      this.cancellationSignal.removeEventListener("abort", this.abortListener);
    }
    this.rejectAll(new Error("ACP client stopped"));
    const child = this.child;
    this.child = null;
    if (!child) return;
    await terminateProcessTree(child);
  }
}

/** Wait for a child to exit, or resolve after `timeoutMs`. */
function waitForExit(child: ChildProcess, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = (): void => {
      clearTimeout(timer);
      child.removeListener("exit", finish);
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);
    child.once("exit", finish);
  });
}

/** Terminate a spawned process and its descendants, escalating to SIGKILL. */
async function terminateProcessTree(child: ChildProcess): Promise<void> {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === "win32") {
    await new Promise<void>((resolve) => {
      execFile("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true }, () => resolve());
    });
    return;
  }
  const signalGroup = (signal: NodeJS.Signals): void => {
    try {
      process.kill(-child.pid!, signal);
    } catch {
      try { child.kill(signal); } catch { /* already gone */ }
    }
  };
  signalGroup("SIGTERM");
  await waitForExit(child, 2000);
  if (child.exitCode === null && child.signalCode === null) signalGroup("SIGKILL");
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

/** Extract streamed agent text from a `session/update` notification. */
export function extractAcpAgentText(params: Record<string, unknown>): string {
  const parsed = AcpSessionUpdateSchema.safeParse(params);
  if (!parsed.success) return "";
  const update = record(parsed.data.update);
  if (!update || update.sessionUpdate !== "agent_message_chunk") return "";
  const content = record(update.content);
  return typeof content?.text === "string" ? content.text : "";
}

function mapAcpUsage(source: unknown, model?: string): RuntimeUsage | undefined {
  const usageRecord = record(source);
  if (!usageRecord) return undefined;
  const usage: RuntimeUsage = { source: "runtime" };
  if (typeof usageRecord.inputTokens === "number") usage.input_tokens = usageRecord.inputTokens;
  if (typeof usageRecord.outputTokens === "number") usage.output_tokens = usageRecord.outputTokens;
  if (typeof usageRecord.totalTokens === "number") usage.total_tokens = usageRecord.totalTokens;
  if (model) usage.model = model;
  return usage;
}

/**
 * Probe the configured ACP agent binary. A protocol version alone is not
 * evidence the server is installed, so unlike a schema-only check this actually
 * executes the command with `--version`.
 */
export async function checkAcp(manifest?: { config?: { cli_command?: string; runtime_config?: unknown } }) {
  let config: AcpRuntimeConfig;
  try {
    config = AcpRuntimeConfigSchema.parse(manifest?.config?.runtime_config);
  } catch (error) {
    return { runtime: "acp", found: false, version: "", errors: [(error as Error).message] };
  }
  const command = manifest?.config?.cli_command || config.server_command;
  try {
    const resolved = await resolveRuntimeCommand(command, [...config.server_args, "--version"], process.env);
    const result = await execFileAsync(resolved.command, resolved.args, { timeout: 15_000, windowsHide: true });
    return { runtime: "acp", found: true, version: (result.stdout || result.stderr).trim(), errors: [] };
  } catch (error) {
    return {
      runtime: "acp",
      found: false,
      version: "",
      errors: [`ACP server "${command}" could not be executed: ${(error as Error).message}`],
    };
  }
}

runtimeRegistry.register("acp", checkAcp);

export async function planAcpRun(
  root: string,
  missionPath: string,
  options: { extraRuntimeConfigOverrides?: Record<string, unknown>; artifactRoot?: string } = {},
) {
  const mission = validateMission(parse(await readFile(missionPath, "utf8")));
  const adapterDoc = (await runtimeRegistry.load(root, "acp")).document;
  const config = AcpRuntimeConfigSchema.parse({
    ...adapterDoc.config?.runtime_config,
    ...mergeRuntimeConfigOverrides(mission, options.extraRuntimeConfigOverrides),
  });

  const workflow = validateWorkflow(
    parse(await readFile(path.join(root, ".harness", "workflows", `${mission.workflow_profile}.yaml`), "utf8")),
  );
  const prompt = renderPrompt(buildDispatchContext(mission, workflow));

  return {
    command: config.server_command,
    args: config.server_args,
    prompt,
    mission,
    config,
    worktree: false,
    session_id_passthrough: false,
    errors: [] as string[],
  };
}

export async function dryRunAcp(
  root: string,
  missionPath: string,
  options: { extraRuntimeConfigOverrides?: Record<string, unknown> } = {},
) {
  const plan = await planAcpRun(root, missionPath, options);
  const artifacts = await getMissionArtifactContext(root, missionPath, generateRunId());
  if (artifacts) {
    await persistPromptAndSession(artifacts, plan.prompt, {
      schema_version: "uh.runtime-session.v0",
      mission_id: plan.mission.id,
      runtime: "acp",
      status: "planned",
      command: plan.command,
      args: plan.args,
    });
  }
  return plan;
}

export interface AcpRunOptions {
  artifactRoot?: string;
  runId?: string;
  /** Overrides the adapter's `runtime_config.timeout_ms` for every request. */
  timeoutMs?: number;
  cancellationSignal?: AbortSignal;
  extraRuntimeConfigOverrides?: Record<string, unknown>;
  collectDiff?: (cwd: string) => Promise<{ patch: string; errors?: string[] }>;
  clientFactory?: (command: string, args: string[], cwd: string, options: AcpClientOptions) => AcpClient;
}

export interface AcpRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  runId: string;
  result: RuntimeResultDocument;
}

export async function runAcp(root: string, missionPath: string, options: AcpRunOptions = {}): Promise<AcpRunResult> {
  const plan = await planAcpRun(root, missionPath, options);
  const runId = options.runId ?? generateRunId();
  const canonical = options.artifactRoot ?? root;
  const artifacts = await getMissionArtifactContext(canonical, missionPath, runId);
  if (artifacts) await claimRuntimeAttempt(artifacts);

  const timeoutMs = options.timeoutMs ?? plan.config.timeout_ms;
  const startedAt = new Date().toISOString();

  if (artifacts) {
    await persistPromptAndSession(artifacts, plan.prompt, {
      schema_version: "uh.runtime-session.v0",
      mission_id: plan.mission.id,
      runtime: "acp",
      status: "running",
      command: plan.command,
      args: plan.args,
      started_at: startedAt,
    });
    await appendRunsIndexEntry(canonical, plan.mission.id, {
      run_id: runId,
      started_at: startedAt,
      status: "running",
      runtime: "acp",
    });
    await writeLatestPointer(canonical, plan.mission.id, {
      schema_version: "uh.latest-run.v0",
      run_id: runId,
      started_at: startedAt,
      status: "running",
    });
    await appendMissionEvent(artifacts, {
      event: "runtime.started",
      runtime: "acp",
      mission_id: plan.mission.id,
      run_id: runId,
      timestamp: startedAt,
    });
  }

  const serverMessages: Record<string, unknown>[] = [];
  const stderrChunks: string[] = [];
  let agentText = "";

  let eventWrites: Promise<void> = Promise.resolve();
  const clientOptions: AcpClientOptions = {
    timeoutMs,
    cancellationSignal: options.cancellationSignal,
    onMessage: (message) => serverMessages.push(message),
    onStderr: (chunk) => stderrChunks.push(chunk),
    onNotification: (method, params) => {
      const eventRecord = { event: `acp.${method}`, timestamp: new Date().toISOString(), ...params };
      if (method === "session/update") agentText += extractAcpAgentText(params);
      if (artifacts) {
        // Serialize appends so failures never surface as unhandled rejections.
        eventWrites = eventWrites.then(() => appendMissionEvent(artifacts, eventRecord)).catch(() => {});
      }
    },
  };

  const client = options.clientFactory
    ? options.clientFactory(plan.command, plan.args, root, clientOptions)
    : new AcpClient(plan.command, plan.args, root, process.env, clientOptions);
  if (options.clientFactory) {
    // Factory-provided clients still need the handlers the adapter installed.
    client.onNotification(clientOptions.onNotification!);
    client.onServerRequest(clientOptions.onServerRequest ?? (() => undefined));
  }

  let status: RuntimeResultStatus = "failed";
  let promptResult: AcpSessionPromptResult | null = null;
  const errors: string[] = [];
  let cancelled = false;

  try {
    await client.start();

    const initResult = AcpInitializeResultSchema.parse(
      await client.request<AcpInitializeResult>("initialize", {
        protocolVersion: plan.config.protocol_version,
        clientCapabilities: {},
        clientInfo: AcpClientInfoSchema.parse({ name: ACP_CLIENT_NAME, version: ACP_CLIENT_VERSION }),
      }),
    );
    if (artifacts) {
      await appendMissionEvent(artifacts, {
        event: "acp.initialized",
        timestamp: new Date().toISOString(),
        agent: initResult.agentInfo,
      });
    }

    const sessionResult = AcpSessionNewResultSchema.parse(
      await client.request<AcpSessionNewResult>("session/new", { cwd: root, mcpServers: [] }),
    );

    promptResult = AcpSessionPromptResultSchema.parse(
      await client.request<AcpSessionPromptResult>("session/prompt", {
        sessionId: sessionResult.sessionId,
        prompt: [AcpContentBlockSchema.parse({ type: "text", text: plan.prompt })],
      }),
    );
  } catch (error) {
    if (options.cancellationSignal?.aborted) {
      cancelled = true;
      status = "cancelled";
      errors.push("ACP run cancelled by the harness");
    } else {
      errors.push((error as Error).message);
      status = "failed";
    }
  } finally {
    await client.stop();
    await eventWrites;
  }

  if (!cancelled && promptResult) {
    if (promptResult.stopReason === "cancelled") {
      status = "cancelled";
      errors.push("ACP agent reported stopReason cancelled");
    } else if (promptResult.stopReason === "refusal") {
      status = "failed";
      errors.push("ACP agent refused the prompt");
    } else if (promptResult.stopReason === "max_tokens" || promptResult.stopReason === "max_turn_requests") {
      status = "blocked";
      errors.push(`ACP agent stopped early: ${promptResult.stopReason}`);
    } else {
      status = "passed";
    }
  }

  const sentinel = extractRuntimeFinalMessageSentinel(agentText);
  const finalMessage = sentinel ?? agentText;

  let diff = { patch: "", errors: [] as string[] };
  try {
    const captured = await (options.collectDiff ?? captureDiffWithUntracked)(root);
    diff = { patch: captured.patch, errors: captured.errors ?? [] };
  } catch (error) {
    diff.errors.push(`Diff capture failed: ${(error as Error).message}`);
  }
  errors.push(...diff.errors);

  const stdout = serverMessages.map((message) => JSON.stringify(message)).join("\n");
  const stderr = stderrChunks.join("");
  const usage = mapAcpUsage(promptResult?.usage, plan.config.model);
  const finishedAt = new Date().toISOString();
  const exitCode = status === "passed" ? 0 : status === "cancelled" ? 130 : 1;

  const result = validateRuntimeResult({
    schema_version: "uh.runtime-result.v0",
    mission_id: plan.mission.id,
    runtime: "acp",
    status,
    started_at: startedAt,
    finished_at: finishedAt,
    exit_code: exitCode,
    prompt_path: artifacts ? relativeArtifactPath(canonical, artifacts.promptPath) : "prompt.md",
    stdout_path: artifacts ? relativeArtifactPath(canonical, artifacts.stdoutPath) : "runtime.stdout.log",
    stderr_path: artifacts ? relativeArtifactPath(canonical, artifacts.stderrPath) : "runtime.stderr.log",
    ...(artifacts ? { diff_path: relativeArtifactPath(canonical, artifacts.diffPath) } : {}),
    errors,
    ...(plan.config.model ? { model: plan.config.model } : {}),
    ...(usage ? { usage } : {}),
  });

  if (artifacts) {
    await writeArtifactFile(artifacts.missionDir, artifacts.stdoutPath, stdout);
    await writeArtifactFile(artifacts.missionDir, artifacts.stderrPath, stderr);
    await writeArtifactFile(artifacts.missionDir, artifacts.diffPath, diff.patch);
    await writeArtifactFile(artifacts.missionDir, artifacts.finalMessagePath, finalMessage);
    await writeArtifactFile(artifacts.missionDir, artifacts.runtimeResultPath, stringify(result));
    await writeArtifactFile(artifacts.missionDir, artifacts.runtimeSessionPath, stringify({
      schema_version: "uh.runtime-session.v0",
      mission_id: plan.mission.id,
      runtime: "acp",
      status: status === "passed" ? "succeeded" : "failed",
      command: plan.command,
      args: plan.args,
      exit_code: exitCode,
      started_at: startedAt,
      finished_at: finishedAt,
      ...(plan.config.model ? { model: plan.config.model } : {}),
      ...(usage ? { usage } : {}),
    }));
    await appendMissionEvent(artifacts, {
      event: "runtime.finished",
      runtime: "acp",
      mission_id: plan.mission.id,
      run_id: runId,
      status,
      timestamp: finishedAt,
    });
    await appendRunsIndexEntry(canonical, plan.mission.id, {
      run_id: runId,
      started_at: startedAt,
      finished_at: finishedAt,
      status,
      runtime: "acp",
    });
    await writeLatestPointer(canonical, plan.mission.id, {
      schema_version: "uh.latest-run.v0",
      run_id: runId,
      started_at: startedAt,
      finished_at: finishedAt,
      status,
    });
    await mirrorRuntimeResultToLatest(canonical, plan.mission.id, runId);
  }

  return { exitCode, stdout, stderr, runId, result };
}
