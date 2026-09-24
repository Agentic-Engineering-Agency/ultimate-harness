import type { AdapterCapabilities } from "../../schema/adapter-capabilities.js";

export const commandCodeCapabilities = {
  schema: "uh.adapter-capabilities.v0",
  id: "command-code",
  display_name: "Command Code",
  tools: { shell: true, fs_read: true, fs_write: true, network: false,
    custom: ["cli-execution", "json-output", "diff-output", "session-resume"] },
  sandbox: "none",
  max_context_tokens: null,
  cost_class: "standard",
  supports_runtime_config_overrides: true,
  supports_cancel: true,
  supports_replay: true,
  notes: "Native Command Code JSON execution. Model and permission policy are explicit runtime configuration; workspace isolation is not an OS security boundary.",
} as const satisfies AdapterCapabilities;
