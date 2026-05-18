import { z } from "zod";
import { registerRuntimeConfigSchema } from "../schema/adapter.js";
import {
  runtimeRegistry,
  type AdapterCheckResult,
  type AdapterRuntimeChecker,
} from "../harness/registry.js";

/**
 * hermes-proxy runtime adapter — UH-32 / UH-35.
 *
 * This file lands the schema, manifest registration, and CLI dispatch stub.
 * The real planner / runner / parser / sentinel arrives in UH-39; the live
 * HTTP health check on `adapter check` arrives in UH-37.
 *
 * Until then the dispatch stubs return a structured `blocked` result so
 * `uh mission run --runtime hermes-proxy <mission>` exits non-zero with a
 * clear remediation pointer instead of silently doing nothing.
 *
 * See docs/architecture/hermes-proxy-spike.md for the wire-format rationale
 * behind these schema choices.
 */

/**
 * Strict Zod schema for `.harness/adapters/hermes-proxy.yaml` →
 * `config.runtime_config`. Validated through the shared
 * `registerRuntimeConfigSchema("hermes-proxy", …)` path established by UH-26.
 *
 * - `endpoint` (required): full URL including `/v1` prefix the proxy listens
 *   on. Default `hermes proxy start` binds `http://127.0.0.1:8645/v1`.
 * - `model` (required): model identifier passed verbatim in the OAI-compat
 *   `model` field. Whatever the upstream provider exposes — e.g.
 *   `hermes-4-405b` for Nous Portal in Hermes 0.14.0.
 * - `provider`: informational only. Used by error messages to surface the
 *   expected `hermes auth status <provider>` remediation hint. Hermes 0.14.0
 *   ships only `nous`; later versions may add `claude` / `chatgpt` /
 *   `supergrok` providers via `hermes proxy start --provider <name>`.
 * - `request_timeout_ms`: per-request timeout. 405B routing latencies can
 *   exceed 90s under load; the default leaves headroom for one upstream
 *   retry without UH cancelling the call.
 * - `extra_headers`: forward-compat escape hatch — any extra headers the
 *   adapter MUST attach to every request. The `Authorization` header is
 *   set by the adapter; do NOT duplicate it here.
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
 * Stub runtime checker (UH-35). Reports the manifest as configured but flags
 * that the live HTTP health check is gated on UH-37. The manifest itself has
 * already been schema-validated by the time this checker runs (validateAdapter
 * runs first), so this checker only surfaces the "real probe pending" status.
 *
 * UH-37 replaces this with a `fetch(`<endpoint>/models`)` probe that maps
 * 401 / 404 / ECONNREFUSED / 200 to the AdapterCheckResult shape.
 */
export const hermesProxyRuntimeChecker: AdapterRuntimeChecker = async (manifest): Promise<AdapterCheckResult> => {
  const rc = manifest.config?.runtime_config as Record<string, unknown> | undefined;
  const endpoint = typeof rc?.endpoint === "string" ? rc.endpoint : "<missing>";
  return {
    runtime: "hermes-proxy",
    found: true,
    version: `manifest-only (endpoint: ${endpoint}; live HTTP probe pending UH-37)`,
    errors: [],
  };
};
runtimeRegistry.register("hermes-proxy", hermesProxyRuntimeChecker);

/**
 * Structured stub dispatch result (UH-35). Returned by both `dryRunHermesProxy`
 * and `runHermesProxy` until UH-39 lands the real planner + runner.
 */
const STUB_BLOCKED_MESSAGE = "hermes-proxy adapter implementation pending (UH-39)";

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
  result?: { status?: string; errors?: string[] };
};

/**
 * Stub dry-run. Reports the placeholder command shape so operators can see
 * `uh mission dry-run --runtime hermes-proxy <mission>` route correctly while
 * UH-39 is still in flight. The `errors[]` entry surfaces the blocker.
 */
export async function dryRunHermesProxy(_root: string, _missionPath: string): Promise<DryRunResult> {
  return {
    command: "POST <endpoint>/chat/completions",
    args: ["<request body built by UH-39>"],
    prompt: "<built by UH-39>",
    worktree: false,
    session_id_passthrough: false,
    errors: [STUB_BLOCKED_MESSAGE],
  };
}

/**
 * Stub run. Returns a structured `blocked` runtime-result so the CLI
 * dispatch can surface `[BLOCKED]` (because `surfaceBlocked: true` is set
 * for `hermes-proxy` in `RUNTIME_WIRINGS`) and exit non-zero. This makes
 * `uh mission run --runtime hermes-proxy …` test-stable.
 */
export async function runHermesProxy(_root: string, _missionPath: string): Promise<RunResult> {
  return {
    exitCode: 1,
    stdout: "",
    stderr: `${STUB_BLOCKED_MESSAGE}\n`,
    result: {
      status: "blocked",
      errors: [STUB_BLOCKED_MESSAGE],
    },
  };
}
