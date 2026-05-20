import type { AdapterCapabilities } from "../../schema/adapter-capabilities.js";

export const codexCapabilities = {
  schema: "uh.adapter-capabilities.v0",
  id: "codex",
  display_name: "OpenAI Codex",
  tools: {
    shell: true,
    fs_read: true,
    fs_write: true,
    network: true,
    custom: ["mcp-tools", "structured-events", "json-output", "diff-output"],
  },
  sandbox: "agentfs",
  max_context_tokens: 272_000,
  cost_class: "premium",
  supports_runtime_config_overrides: true,
  supports_cancel: true,
  supports_replay: true,
  notes: "codex exec in git-worktree sandbox with workspace-write isolation.",
} as const satisfies AdapterCapabilities;
