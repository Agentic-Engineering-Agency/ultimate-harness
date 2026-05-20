#!/usr/bin/env node
/**
 * Build script for the Hermes dashboard plugin bundle.
 *
 *   bun apps/hermes-plugin/esbuild.config.mjs           # one-shot production build
 *   bun apps/hermes-plugin/esbuild.config.mjs --watch   # rebuild on change
 *
 * Output:
 *   apps/hermes-plugin/dashboard/dist/index.js   (IIFE, minified)
 *   apps/hermes-plugin/dashboard/dist/style.css  (minified)
 *
 * The output must stay under 50 KB — React and the UI kit come from the
 * dashboard via `window.__HERMES_PLUGIN_SDK__`, so we never bundle them.
 */
import { build, context } from "esbuild";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dashboardDir = path.join(__dirname, "dashboard");
const srcDir = path.join(dashboardDir, "src");
const distDir = path.join(dashboardDir, "dist");
const watch = process.argv.includes("--watch");

mkdirSync(distDir, { recursive: true });

/**
 * The dashboard SDK lives on `window.__HERMES_PLUGIN_SDK__` and exposes React
 * (incl. hooks) under `.React`. We expose it as a global `React` via this
 * banner so JSX desugars to `React.createElement(...)` and hooks resolve
 * without `import React from "react"` — which lets us keep React (the heaviest
 * dependency by far) entirely outside our bundle.
 */
const BANNER = "var React=window.__HERMES_PLUGIN_SDK__.React;";

const jsOpts = {
  entryPoints: [path.join(srcDir, "index.tsx")],
  bundle: true,
  format: "iife",
  globalName: "__uh_plugin__",
  platform: "browser",
  target: ["es2020"],
  jsxFactory: "React.createElement",
  jsxFragment: "React.Fragment",
  banner: { js: BANNER },
  minify: true,
  sourcemap: false,
  legalComments: "none",
  outfile: path.join(distDir, "index.js"),
  logLevel: "info",
};

const cssOpts = {
  entryPoints: [path.join(srcDir, "styles.css")],
  bundle: false,
  minify: true,
  outfile: path.join(distDir, "style.css"),
  logLevel: "info",
};

if (watch) {
  const jsCtx = await context(jsOpts);
  const cssCtx = await context(cssOpts);
  await Promise.all([jsCtx.watch(), cssCtx.watch()]);
  // eslint-disable-next-line no-console
  console.log(`[plugin:watch] watching ${path.relative(process.cwd(), srcDir)} -> dist/`);
} else {
  await Promise.all([build(jsOpts), build(cssOpts)]);
  // eslint-disable-next-line no-console
  console.log(`[plugin:build] wrote ${path.relative(process.cwd(), distDir)}/index.js + style.css`);
}
