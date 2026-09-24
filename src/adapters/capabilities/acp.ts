import type { AdapterCapabilities } from "../../schema/adapter-capabilities.js";

export const acpCapabilities = {
  schema: "uh.adapter-capabilities.v0",
  id: "acp",
  display_name: "Agent-Client Protocol (ACP)",
  tools: { shell: true, fs_read: true, fs_write: true, network: false,
    custom: ["cli-execution", "non-interactive", "one-shot", "json-output", "diff-output"] },
  sandbox: "none",
  max_context_tokens: null,
  cost_class: "standard",
  supports_runtime_config_overrides: true,
  supports_cancel: true,
  supports_replay: false,
  notes: "Bidirectional JSON-RPC 2.0 over stdio with any ACP-compliant agent server. Model and server command are explicit runtime configuration; the client answers the agent's fs/terminal/permission requests but is not an OS sandbox.",
} as const satisfies AdapterCapabilities;
