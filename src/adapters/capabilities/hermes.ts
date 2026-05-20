import type { AdapterCapabilities } from "../../schema/adapter-capabilities.js";

export const hermesCapabilities = {
  schema: "uh.adapter-capabilities.v0",
  id: "hermes",
  display_name: "Hermes Agent",
  tools: {
    shell: true,
    fs_read: true,
    fs_write: true,
    network: true,
    custom: ["cli-execution", "skill-loading", "toolset-config", "session-resume"],
  },
  sandbox: "agentfs",
  max_context_tokens: 200_000,
  cost_class: "standard",
  supports_runtime_config_overrides: true,
  supports_cancel: true,
  supports_replay: true,
  notes: "Spawn-based Hermes CLI with terminal, file, and web toolsets.",
} as const satisfies AdapterCapabilities;
