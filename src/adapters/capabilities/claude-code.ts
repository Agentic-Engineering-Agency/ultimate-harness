import type { AdapterCapabilities } from "../../schema/adapter-capabilities.js";

export const CLAUDE_CODE_CAPABILITIES = {
  schema: "uh.adapter-capabilities.v0",
  id: "claude-code",
  display_name: "Claude Code",
  tools: { shell: true, fs_read: true, fs_write: true, network: false,
    custom: ["cli-execution", "non-interactive", "stream-json", "structured-events", "diff-output", "session-resume"] },
  sandbox: "none",
  max_context_tokens: null,
  cost_class: "standard",
  supports_runtime_config_overrides: true,
  supports_cancel: true,
  supports_replay: true,
  notes: "Native Claude Code CLI stream-json execution with exact model routing, UH PreToolUse guard hooks, and native session recovery. The guard policy and process supervisor are not an OS sandbox.",
} as const satisfies AdapterCapabilities;
