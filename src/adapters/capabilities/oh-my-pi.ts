import type { AdapterCapabilities } from "../../schema/adapter-capabilities.js";

export const ohMyPiCapabilities = {
  schema: "uh.adapter-capabilities.v0",
  id: "oh-my-pi",
  display_name: "oh-my-pi",
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
  notes: "omp --print --mode json; extensions and skills disabled by default.",
} as const satisfies AdapterCapabilities;
