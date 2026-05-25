import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { adaptersDir } from "./paths.js";
import { fileExists } from "./mission.js";

/**
 * Built-in adapter manifest templates. These mirror the canonical manifests
 * that live in this repo's own `.harness/adapters/` directory. `uh adapter
 * add <runtime>` writes the named template into the target project's
 * `.harness/adapters/<runtime>.yaml`.
 *
 * Wired adapters (post v0.1.0):
 * - `hermes`     — active   (reference adapter)
 * - `codex`      — active   (verified end-to-end against codex-cli 0.130.0)
 * - `oh-my-pi`   — active
 *
 * Adapters tracked on the roadmap (not yet templated):
 * - `hermes-proxy` — see UH-32 / docs/ROADMAP.md
 */
const ADAPTER_TEMPLATES: Record<string, string> = {
  hermes: `schema_version: uh.adapter.v0
id: hermes
name: Hermes Agent
description: Runtime adapter for Hermes Agent (Nous Research). Executes missions via hermes CLI. Requires hermes >= 0.14.0.
runtime: hermes
capabilities:
  - cli-execution
  - worktree-isolation
  - skill-loading
  - toolset-config
  - session-resume
status: active
config:
  cli_command: hermes
  default_toolsets:
    - terminal
    - file
    - web
    - skills
    - session_search
  default_provider: ""
  default_model: ""
  worktree_mode: false
  pass_session_id: true
`,
  codex: `schema_version: uh.adapter.v0
id: codex
name: OpenAI Codex
description: >-
  Runtime adapter for the OpenAI Codex CLI. Executes missions via
  \`codex exec\` inside a git-worktree sandbox with --sandbox workspace-write.
  Verified against codex-cli 0.130.0.
  See docs/architecture/adapter-codex.md and docs/runbooks/codex-e2e-smoke.md.
runtime: codex
capabilities:
  - cli-execution
  - non-interactive
  - one-shot
  - background
  - worktree-isolation
  - json-output
  - diff-output
  - mcp-tools
  - structured-events
status: active
config:
  cli_command: codex
  default_toolsets: []
  default_provider: ""
  default_model: ""
  worktree_mode: true
  pass_session_id: false
  runtime_config:
    sandbox_mode: workspace-write
    approval_policy: never
    full_auto_compat: false
`,
  "oh-my-pi": `schema_version: uh.adapter.v0
id: oh-my-pi
name: oh-my-pi
description: >-
  Runtime adapter for oh-my-pi (omp), a multi-provider CLI coding agent.
  Executes missions via \`omp --print --mode json\` with sessions ephemeral and
  extensions/skills disabled by default for deterministic runs. Provider /
  account auth flows through OMP's own credential store and env vars.
  See docs/runbooks/anthropic-via-omp.md for the Anthropic-via-OMP routing
  path and its ToS posture.
runtime: oh-my-pi
capabilities:
  - cli-execution
  - non-interactive
  - one-shot
  - background
  - worktree-isolation
  - json-output
  - diff-output
status: active
config:
  cli_command: omp
  default_toolsets: []
  default_provider: ""
  default_model: ""
  worktree_mode: false
  pass_session_id: false
  runtime_config:
    mode: json
    thinking: ""
    allow_extensions: false
    allow_skills: false
`,
  "hermes-proxy": `schema_version: uh.adapter.v0
id: hermes-proxy
name: Hermes Proxy
description: >-
  HTTP client targeting a local \`hermes proxy\` instance (Hermes Agent
  >= 0.14.0). Officially sanctioned OAuth-backed subscription routing that
  replaces the OMP stealth path. v0.14.0 ships only the \`nous\` upstream
  provider; future Hermes versions may add \`claude\` / \`chatgpt\` /
  \`supergrok\`. The adapter stays provider-agnostic — it just speaks
  OpenAI-compat to \`endpoint\`.
  See docs/architecture/hermes-proxy-spike.md.
runtime: hermes-proxy
capabilities:
  - subscription-auth
  - oai-compat
  - http-transport
  - sentinel-protocol
status: active
config:
  default_toolsets: []
  default_provider: ""
  default_model: ""
  worktree_mode: false
  pass_session_id: false
  runtime_config:
    endpoint: "http://127.0.0.1:8645/v1"
    model: "nousresearch/hermes-4-405b"
    provider: nous
    request_timeout_ms: 120000
    extra_headers: {}
`,
  openrouter: `schema_version: uh.adapter.v0
id: openrouter
name: OpenRouter
description: >-
  OpenAI-compatible HTTP client for https://openrouter.ai/api/v1 — the cheapest
  pay-per-token routing target, complementary to the subscription-backed
  hermes-proxy. The API key is read from the OPENROUTER_API_KEY environment
  variable and never stored here. See docs/runbooks/openrouter-setup.md.
runtime: openrouter
capabilities:
  - oai-compat
  - http-transport
  - sentinel-protocol
  - pay-per-token
status: active
config:
  default_toolsets: []
  default_provider: ""
  default_model: ""
  worktree_mode: false
  pass_session_id: false
  runtime_config:
    endpoint: "https://openrouter.ai/api/v1"
    model: "openai/gpt-4o-mini"
    request_timeout_ms: 120000
    extra_headers: {}
`,
  pi: `schema_version: uh.adapter.v0
id: pi
name: pi
description: >-
  Runtime adapter for the vanilla \`pi\` agent CLI — the base CLI that oh-my-pi
  (omp) extends. Executes missions via \`pi --mode json --no-session\` with
  extensions/skills disabled by default for deterministic runs. Set
  \`config.cli_command\` if the binary is not \`pi\` on PATH.
  See docs/runbooks/pi-setup.md.
runtime: pi
capabilities:
  - cli-execution
  - non-interactive
  - one-shot
  - worktree-isolation
  - json-output
  - diff-output
status: active
config:
  cli_command: pi
  default_toolsets: []
  default_provider: ""
  default_model: ""
  worktree_mode: false
  pass_session_id: false
  runtime_config:
    mode: json
    thinking: ""
    allow_extensions: false
    allow_skills: false
`,
};

export type AddAdapterResult = {
  runtime: string;
  path: string;
  created: boolean;
};

export type AddAdapterOptions = {
  force?: boolean;
};

export function listAdapterTemplates(): string[] {
  return Object.keys(ADAPTER_TEMPLATES).sort();
}

export async function addAdapter(
  root: string,
  runtime: string,
  options: AddAdapterOptions = {},
): Promise<AddAdapterResult> {
  const template = ADAPTER_TEMPLATES[runtime];
  if (!template) {
    throw new Error(
      `Unknown adapter template: ${runtime}. Available: ${listAdapterTemplates().join(", ")}`,
    );
  }
  const dir = adaptersDir(root);
  await mkdir(dir, { recursive: true });
  const target = path.join(dir, `${runtime}.yaml`);
  if (!options.force && (await fileExists(target))) {
    throw new Error(
      `Adapter manifest already exists at ${target}. Pass --force to overwrite.`,
    );
  }
  await writeFile(target, template, "utf-8");
  return { runtime, path: target, created: true };
}
