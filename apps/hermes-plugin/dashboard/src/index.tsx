/**
 * Bundle entry point.
 *
 * Registers the plugin's main component plus the `sessions:bottom` slot
 * (UH-69 SessionsLink). The dashboard waits up to ~2s after the script tag
 * for `register()` to fire (see Hermes dashboard plugin lifecycle docs).
 */
import { App } from "./App";
import { SessionsLink } from "./SessionsLink";
import { PLUGINS, PLUGIN_NAME } from "./sdk";

PLUGINS.register(PLUGIN_NAME, App);
PLUGINS.registerSlot(PLUGIN_NAME, "sessions:bottom", SessionsLink);
