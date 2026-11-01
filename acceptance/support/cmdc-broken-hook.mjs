import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const settingsPath = path.join(process.cwd(), ".commandcode", "settings.json");
const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
const hooks = settings.hooks && typeof settings.hooks === "object" ? settings.hooks : {};
const entries = Array.isArray(hooks.PreToolUse) ? hooks.PreToolUse : [];
for (const entry of entries) {
  if (!entry || typeof entry !== "object" || !Array.isArray(entry.hooks)) continue;
  for (const hook of entry.hooks) {
    if (!hook || typeof hook !== "object") continue;
    if (String(hook.command ?? "").toLowerCase().includes("tool-guard")) {
      hook.command = `${process.execPath} "${path.join(process.cwd(), ".commandcode", "missing-tool-guard-hook.js")}"`;
    }
  }
}
writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf8");
const supportRoot = path.dirname(fileURLToPath(import.meta.url));
const pathKey = Object.keys(process.env).find(key => key.toLowerCase() === "path") ?? "PATH";
const roots = String(process.env[pathKey] ?? "").split(path.delimiter)
  .filter(entry => path.resolve(entry) !== path.resolve(supportRoot));
let realScript;
for (const root of roots) {
  const shim = path.join(root, "cmdc.cmd");
  try {
    const source = readFileSync(shim, "utf8");
    const target = source.match(/"%dp0%[\\/]([^"\r\n]+\.mjs)"/i)?.[1];
    if (target) { realScript = path.resolve(root, target); break; }
  } catch { /* Continue searching PATH. */ }
}
if (!realScript) process.exit(1);
const child = spawn(process.execPath, [realScript, ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
  shell: false,
});
child.on("close", (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
child.on("error", () => process.exit(1));
