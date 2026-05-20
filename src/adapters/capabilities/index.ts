import { TEAM_ADAPTER_IDS } from "../../schema/mission.js";
import {
  AdapterCapabilitiesSchema,
  type AdapterCapabilities,
} from "../../schema/adapter-capabilities.js";
import { codexCapabilities } from "./codex.js";
import { hermesCapabilities } from "./hermes.js";
import { hermesProxyCapabilities } from "./hermes-proxy.js";
import { ohMyPiCapabilities } from "./oh-my-pi.js";

export type AdapterId = (typeof TEAM_ADAPTER_IDS)[number];

export const CAPABILITIES: Record<AdapterId, AdapterCapabilities> = {
  hermes: hermesCapabilities,
  "hermes-proxy": hermesProxyCapabilities,
  codex: codexCapabilities,
  "oh-my-pi": ohMyPiCapabilities,
};

export function getCapabilities(id: AdapterId): AdapterCapabilities {
  return CAPABILITIES[id];
}

export function listAdapterIds(): AdapterId[] {
  return [...TEAM_ADAPTER_IDS];
}

/** Parse and return a manifest; throws on schema mismatch. */
export function parseCapabilitiesManifest(data: unknown): AdapterCapabilities {
  return AdapterCapabilitiesSchema.parse(data);
}

export { codexCapabilities, hermesCapabilities, hermesProxyCapabilities, ohMyPiCapabilities };
