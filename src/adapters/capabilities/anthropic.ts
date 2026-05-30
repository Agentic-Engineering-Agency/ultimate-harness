import type { AdapterCapabilities } from "../../schema/adapter-capabilities.js";

export const anthropicCapabilities = {
  schema: "uh.adapter-capabilities.v0",
  id: "anthropic",
  display_name: "Anthropic",
  tools: {
    shell: false,
    fs_read: false,
    fs_write: false,
    network: true,
    custom: ["messages-api", "http-transport", "sentinel-protocol", "pay-per-token"],
  },
  sandbox: "remote-only",
  max_context_tokens: 200_000,
  cost_class: "standard",
  supports_runtime_config_overrides: true,
  supports_cancel: true,
  supports_replay: false,
  notes: "Native HTTP client for Anthropic's Messages API; API key via ANTHROPIC_API_KEY. Official pay-per-token, distinct from hermes-proxy/oh-my-pi.",
} as const satisfies AdapterCapabilities;
