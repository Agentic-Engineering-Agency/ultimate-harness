import type { AdapterCapabilities } from "../../schema/adapter-capabilities.js";

export const piCapabilities = {
  schema: "uh.adapter-capabilities.v0",
  id: "pi",
  display_name: "pi",
  tools: {
    shell: true,
    fs_read: true,
    fs_write: true,
    network: false,
    custom: ["cli-execution", "json-output", "diff-output"],
  },
  sandbox: "none",
  max_context_tokens: 128_000,
  cost_class: "standard",
  supports_runtime_config_overrides: true,
  supports_cancel: true,
  supports_replay: true,
  notes: "Vanilla pi agent CLI (`pi --mode json --no-session`); the base CLI that oh-my-pi extends. Extensions/skills disabled by default for deterministic runs.",
} as const satisfies AdapterCapabilities;
