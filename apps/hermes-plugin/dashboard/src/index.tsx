/**
 * Bundle entry point.
 *
 * Registers the plugin's main component. The dashboard waits up to ~2s after
 * the script tag for `register()` to fire (see Hermes dashboard plugin
 * lifecycle docs).
 *
 * Subsequent slices add `registerSlot(...)` calls here (UH-69 sessions:bottom).
 */
import { App } from "./App";
import { PLUGINS, PLUGIN_NAME } from "./sdk";

PLUGINS.register(PLUGIN_NAME, App);
