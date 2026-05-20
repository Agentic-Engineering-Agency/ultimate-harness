import type { AdapterCapabilities } from "../../schema/adapter-capabilities.js";

export const hermesProxyCapabilities = {
  schema: "uh.adapter-capabilities.v0",
  id: "hermes-proxy",
  display_name: "Hermes Proxy",
  tools: {
    shell: false,
    fs_read: false,
    fs_write: false,
    network: true,
    custom: ["subscription-auth", "oai-compat", "http-transport", "sentinel-protocol"],
  },
  sandbox: "remote-only",
  max_context_tokens: 405_000,
  cost_class: "cheap",
  supports_runtime_config_overrides: true,
  supports_cancel: true,
  supports_replay: false,
  notes: "HTTP client to local hermes proxy; no local shell or filesystem tools.",
} as const satisfies AdapterCapabilities;
