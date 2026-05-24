import type { AdapterCapabilities } from "../../schema/adapter-capabilities.js";

export const openRouterCapabilities = {
  schema: "uh.adapter-capabilities.v0",
  id: "openrouter",
  display_name: "OpenRouter",
  tools: {
    shell: false,
    fs_read: false,
    fs_write: false,
    network: true,
    custom: ["oai-compat", "http-transport", "sentinel-protocol", "pay-per-token"],
  },
  sandbox: "remote-only",
  max_context_tokens: 200_000,
  cost_class: "cheap",
  supports_runtime_config_overrides: true,
  supports_cancel: true,
  supports_replay: false,
  notes: "OpenAI-compat HTTP client for openrouter.ai; API key via OPENROUTER_API_KEY. Cheapest pay-per-token routing target.",
} as const satisfies AdapterCapabilities;
