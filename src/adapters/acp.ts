import { spawn, type ChildProcess } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { validateMission } from "../schema/mission.js";
import { runtimeRegistry } from "../harness/registry.js";
import {
  AcpRuntimeConfigSchema,
  type AcpRuntimeConfig,
  type AcpInitializeResult,
  type AcpSessionNewResult,
  type AcpSessionPromptResult,
} from "../schema/acp.js";
import { registerRuntimeConfigSchema } from "../schema/adapter.js";
import { renderPrompt } from "../harness/render-prompt.js";
import { buildDispatchContext } from "../harness/dispatch-context.js";
import { mergeRuntimeConfigOverrides } from "../harness/runtime-config-overrides.js";
import { generateRunId, mirrorRuntimeResultToLatest, writeLatestPointer } from "../harness/run-id.js";
import { captureDiffWithUntracked } from "../harness/diff-capture.js";
import {
  appendMissionEvent,
  getMissionArtifactContext,
  persistPromptAndSession,
  writeArtifactFile,
} from "./_artifact-context.js";

registerRuntimeConfigSchema("acp", AcpRuntimeConfigSchema);

export class AcpClient {
  private child: ChildProcess | null = null;
  private requestId = 1;
  private pending = new Map<number | string, { resolve: (val: unknown) => void; reject: (err: Error) => void }>();
  private buffer = "";
  private onNotificationHandler?: (method: string, params: Record<string, unknown>) => void;

  constructor(
    private command: string,
    private args: string[],
    private cwd: string,
    private env: NodeJS.ProcessEnv = process.env,
  ) {}

  public onNotification(handler: (method: string, params: Record<string, unknown>) => void) {
    this.onNotificationHandler = handler;
  }

  public async start(): Promise<void> {
    this.child = spawn(this.command, this.args, {
      cwd: this.cwd,
      env: this.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.child.stdout?.on("data", (chunk: Buffer) => {
      this.buffer += chunk.toString("utf8");
      this.processBuffer();
    });

    this.child.stderr?.on("data", () => {
      // standard stderr logging can be attached if needed
    });

    this.child.on("error", (err) => {
      for (const p of this.pending.values()) {
        p.reject(err);
      }
      this.pending.clear();
    });

    this.child.on("exit", (code) => {
      for (const p of this.pending.values()) {
        p.reject(new Error(`ACP server process exited prematurely with code ${code}`));
      }
      this.pending.clear();
    });
  }

  private processBuffer() {
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const msg = JSON.parse(trimmed) as {
          jsonrpc?: string;
          id?: number | string;
          result?: unknown;
          error?: { code: number; message: string; data?: unknown };
          method?: string;
          params?: Record<string, unknown>;
        };

        if (msg.id !== undefined && this.pending.has(msg.id)) {
          const handler = this.pending.get(msg.id)!;
          this.pending.delete(msg.id);
          if (msg.error) {
            handler.reject(new Error(`ACP Error ${msg.error.code}: ${msg.error.message}`));
          } else {
            handler.resolve(msg.result);
          }
        } else if (msg.method) {
          this.onNotificationHandler?.(msg.method, msg.params ?? {});
        }
      } catch {
        // non-JSON or partial stream lines ignored
      }
    }
  }

  public async request<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    if (!this.child || !this.child.stdin || this.child.stdin.destroyed) {
      throw new Error("ACP client is not running or stdin is closed");
    }

    const id = this.requestId++;
    const payload = JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params: params ?? {},
    }) + "\n";

    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (val: unknown) => void, reject });
      this.child!.stdin!.write(payload, "utf8");
    });
  }

  public async stop(): Promise<void> {
    if (!this.child) return;
    this.child.kill();
    this.child = null;
  }
}

export async function checkAcp(manifest?: { config?: { runtime_config?: unknown } }) {
  try {
    const config = AcpRuntimeConfigSchema.parse(manifest?.config?.runtime_config);
    return {
      runtime: "acp",
      found: true,
      version: config.protocol_version,
      errors: [],
    };
  } catch (err) {
    return {
      runtime: "acp",
      found: false,
      version: "",
      errors: [(err as Error).message],
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

  const workflow = parse(
    await readFile(path.join(root, ".harness", "workflows", `${mission.workflow_profile}.yaml`), "utf8"),
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
    expectedRoute: { model: config.model ?? "acp-agent" },
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

export async function runAcp(
  root: string,
  missionPath: string,
  options: {
    artifactRoot?: string;
    extraRuntimeConfigOverrides?: Record<string, unknown>;
    clientFactory?: (command: string, args: string[], cwd: string) => AcpClient;
  } = {},
) {
  const plan = await planAcpRun(root, missionPath, options);
  const runId = generateRunId();
  const canonicalRoot = options.artifactRoot ?? root;
  const artifacts = await getMissionArtifactContext(canonicalRoot, missionPath, runId);

  if (artifacts) {
    await persistPromptAndSession(artifacts, plan.prompt, {
      schema_version: "uh.runtime-session.v0",
      mission_id: plan.mission.id,
      runtime: "acp",
      status: "running",
      command: plan.command,
      args: plan.args,
    });
  }

  const client = options.clientFactory
    ? options.clientFactory(plan.command, plan.args, root)
    : new AcpClient(plan.command, plan.args, root);

  const events: Record<string, unknown>[] = [];
  client.onNotification(async (method, params) => {
    const eventRecord = {
      event: `acp.${method}`,
      timestamp: new Date().toISOString(),
      ...params,
    };
    events.push(eventRecord);
    if (artifacts) {
      await appendMissionEvent(artifacts, eventRecord);
    }
  });

  let status: "passed" | "failed" = "failed";
  let promptResult: AcpSessionPromptResult | null = null;
  const errors: string[] = [];

  try {
    await client.start();

    // 1. initialize
    const initResult = await client.request<AcpInitializeResult>("initialize", {
      protocol_version: plan.config.protocol_version,
      client_info: { name: "ultimate-harness", version: "0.11.0" },
    });

    if (artifacts) {
      await appendMissionEvent(artifacts, {
        event: "acp.initialized",
        timestamp: new Date().toISOString(),
        agent: initResult.agent_info,
      });
    }

    // 2. session/new
    const sessionResult = await client.request<AcpSessionNewResult>("session/new", {
      cwd: root,
      mission_id: plan.mission.id,
    });

    // 3. session/prompt
    promptResult = await client.request<AcpSessionPromptResult>("session/prompt", {
      session_id: sessionResult.session_id,
      prompt: plan.prompt,
    });

    if (promptResult.stop_reason === "end_turn" || promptResult.stop_reason === undefined) {
      status = "passed";
    }
  } catch (err) {
    errors.push((err as Error).message);
    status = "failed";
  } finally {
    await client.stop();
  }

  let diff: { patch: string; errors: string[] } = { patch: "", errors: [] };
  try {
    const captured = await captureDiffWithUntracked(root);
    diff = { patch: captured.patch, errors: captured.errors ?? [] };
  } catch (err) {
    diff.errors.push((err as Error).message);
  }

  const resultDocument = {
    schema_version: "uh.runtime-result.v0",
    mission_id: plan.mission.id,
    run_id: runId,
    runtime: "acp",
    status,
    output: promptResult?.final_text ?? "",
    errors,
    usage: promptResult?.usage ?? {},
    diff: diff.patch,
  };
  const startedAt = new Date().toISOString();
  const finishedAt = new Date().toISOString();
  if (artifacts) {
    await writeArtifactFile(artifacts.missionDir, artifacts.runtimeResultPath, JSON.stringify(resultDocument, null, 2));
    await writeLatestPointer(canonicalRoot, plan.mission.id, {
      schema_version: "uh.latest-run.v0",
      run_id: runId,
      started_at: startedAt,
      finished_at: finishedAt,
      status,
    });
    await mirrorRuntimeResultToLatest(canonicalRoot, plan.mission.id, runId);
  }

  return {
    exitCode: status === "passed" ? 0 : 1,
    stdout: promptResult?.final_text ?? "",
    stderr: errors.join("\n"),
    runId,
    result: resultDocument,
    events,
  };
}
