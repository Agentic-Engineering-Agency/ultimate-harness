import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { adaptersDir } from "./paths.js";
import { fileExists } from "./mission.js";

/**
 * Built-in adapter manifest templates. These mirror the canonical manifests
 * that live in this repo's own `.harness/adapters/` and are what `uh init`
 * conspicuously refuses to seed. `uh adapter add <runtime>` writes the named
 * template into the target project's `.harness/adapters/<runtime>.yaml`.
 *
 * Hermes is the only `status: active` template; the rest are `experimental`
 * design stubs matching the v0.1.0 ship state.
 */
const ADAPTER_TEMPLATES: Record<string, string> = {
  hermes: `schema_version: uh.adapter.v0
id: hermes
name: Hermes Agent
description: Runtime adapter for Hermes Agent (Nous Research). Executes missions via hermes CLI.
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
  Runtime adapter design for the OpenAI Codex CLI. Executes missions via
  \`codex exec\` inside a git-worktree sandbox with --sandbox workspace-write.
  See docs/architecture/adapter-codex.md. Design-only; no runtime wiring yet.
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
  "claude-code": `schema_version: uh.adapter.v0
id: claude-code
name: Claude Code
description: >-
  Runtime adapter design for the Anthropic Claude Code CLI. Design-only;
  no runtime wiring yet.
runtime: claude-code
capabilities:
  - cli-execution
  - worktree-isolation
  - skill-loading
  - mcp-tools
status: experimental
config:
  cli_command: claude
  default_toolsets: []
  default_provider: ""
  default_model: ""
  worktree_mode: true
  pass_session_id: false
`,
  pi: `schema_version: uh.adapter.v0
id: pi
name: Pi
description: >-
  Runtime adapter design for Pi (Inflection's terminal coding agent).
  Design-only; no runtime wiring yet.
runtime: pi
capabilities:
  - cli-execution
  - worktree-isolation
status: experimental
config:
  cli_command: pi
  default_toolsets: []
  default_provider: ""
  default_model: ""
  worktree_mode: false
  pass_session_id: false
`,
  "oh-my-pi": `schema_version: uh.adapter.v0
id: oh-my-pi
name: oh-my-pi
description: >-
  Runtime adapter for oh-my-pi (omp), a multi-provider CLI coding agent.
  Executes missions via \`omp --print --mode json\` with sessions ephemeral and
  extensions/skills disabled by default for deterministic runs. Provider /
  account auth flows through OMP's own credential store and env vars.
runtime: oh-my-pi
capabilities:
  - cli-execution
  - non-interactive
  - one-shot
  - background
  - worktree-isolation
  - json-output
  - diff-output
status: experimental
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
  const projectRoot = path.resolve(root);
  const adaptersRoot = adaptersDir(projectRoot);
  await mkdir(adaptersRoot, { recursive: true });
  const manifestPath = path.join(adaptersRoot, `${runtime}.yaml`);
  if (!options.force && (await fileExists(manifestPath))) {
    throw new Error(
      `Adapter manifest already exists: ${manifestPath}. Re-run with --force to overwrite.`,
    );
  }
  await writeFile(manifestPath, template, "utf-8");
  return {
    runtime,
    path: manifestPath,
    created: true,
  };
}
