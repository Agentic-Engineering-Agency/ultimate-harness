/** UH-95 — cancel an in-flight mission run via the Hermes plugin API. */

export interface MissionCancelResult {
  ok: boolean;
  status: string;
}

export interface MissionCancelErrorPayload {
  error?: string;
  code?: string;
}

export class MissionCancelError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, opts: { status: number; code?: string }) {
    super(message);
    this.name = "MissionCancelError";
    this.status = opts.status;
    this.code = opts.code;
  }
}

export function defaultPluginApiBase(): string {
  const fromEnv = process.env.UH_PLUGIN_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return "http://127.0.0.1:9119/api/plugins/uh";
}

export async function cancelMissionRunViaPlugin(
  pluginApiBase: string,
  runId: string,
): Promise<MissionCancelResult> {
  const base = pluginApiBase.replace(/\/$/, "");
  const url = `${base}/runs/${encodeURIComponent(runId)}/cancel`;
  let resp: Response;
  try {
    resp = await fetch(url, { method: "POST" });
  } catch (err) {
    throw new MissionCancelError(
      `plugin cancel request failed: ${(err as Error).message}`,
      { status: 0 },
    );
  }
  let body: MissionCancelResult & MissionCancelErrorPayload = { ok: false, status: "unknown" };
  try {
    body = (await resp.json()) as MissionCancelResult & MissionCancelErrorPayload;
  } catch {}
  if (!resp.ok) {
    throw new MissionCancelError(body.error ?? `cancel failed (${resp.status})`, {
      status: resp.status,
      code: body.code,
    });
  }
  return { ok: body.ok === true, status: body.status ?? "cancelled" };
}
