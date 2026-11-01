import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/**
 * Functional guard-hook fixtures for the adapter suites.
 *
 * The adapters publish a content-addressed copy of their built guard hook and
 * now arm it before launch, so a no-op stub would (correctly) abort every
 * guarded run. `snapshotGuardHook` walks each hook's static imports to publish a
 * closed set of files, so a fixture must be self-contained: it may import only
 * `node:` builtins.
 *
 * The command hooks re-exec the real TypeScript source through `tsx`, so the
 * adapter suites still arm and run the real hook. The oh-my-pi extension cannot
 * delegate that way (the snapshot loader imports it in-process), so its fixture
 * is a small policy-aware `tool_call` handler.
 */

function sourcePath(fileName: string): string {
  return fileURLToPath(new URL(`../src/extensions/tool-guard/${fileName}`, import.meta.url));
}

function subprocessHook(fileName: string): string {
  const source = sourcePath(fileName);
  return [
    `import { spawn } from "node:child_process";`,
    `const child = spawn(process.execPath, ["--import=tsx", ${JSON.stringify(source)}], { stdio: ["pipe", "inherit", "inherit"] });`,
    `process.stdin.pipe(child.stdin);`,
    `child.on("exit", (code) => { process.exitCode = code ?? 1; });`,
    ``,
  ].join("\n");
}

function extensionHook(): string {
  return [
    `import { appendFile, readFile } from "node:fs/promises";`,
    `import path from "node:path";`,
    ``,
    `const WRITE_TOOLS = new Set(["write_file", "edit_file", "notebook_edit", "multi_edit", "write", "edit", "create_file", "apply_patch", "delete_file", "remove", "move_file"]);`,
    ``,
    `export default function (pi) {`,
    `  pi.on("tool_call", async (event) => {`,
    `    const policyPath = process.env.UH_TOOL_GUARD_POLICY;`,
    `    const logPath = process.env.UH_TOOL_GUARD_LOG;`,
    `    const tool = typeof event?.toolName === "string" ? event.toolName : "";`,
    `    const input = event?.input && typeof event.input === "object" && !Array.isArray(event.input) ? event.input : {};`,
    `    const callId = typeof event?.toolCallId === "string" && event.toolCallId ? event.toolCallId : undefined;`,
    `    const target = typeof input.file_path === "string" ? input.file_path : typeof input.path === "string" ? input.path : tool;`,
    `    let policy;`,
    `    try {`,
    `      if (!policyPath) throw new Error("missing policy path");`,
    `      policy = JSON.parse(await readFile(policyPath, "utf8"));`,
    `    } catch {`,
    `      return { block: true, reason: "UH tool guard policy could not be loaded; refusing the tool call" };`,
    `    }`,
    `    const root = String(policy.worker_root ?? "");`,
    `    const roots = Array.isArray(policy.write_roots) ? policy.write_roots : [];`,
    `    const inside = (base, candidate) => {`,
    `      const relative = path.relative(base, candidate);`,
    `      return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));`,
    `    };`,
    `    const isWrite = WRITE_TOOLS.has(tool.toLowerCase());`,
    `    const allowed = !isWrite || roots.some((rule) => inside(path.resolve(root, rule), path.resolve(root, target)));`,
    `    const entry = { ts: new Date().toISOString(), tool, class: allowed ? "allow" : "write_outside", target };`,
    `    if (callId) entry.call_id = callId;`,
    `    if (!allowed) entry.reason = "CONTRACT: write only under " + roots.join(", ") + ".";`,
    `    try {`,
    `      if (!logPath) throw new Error("missing log path");`,
    `      await appendFile(logPath, JSON.stringify(entry) + "\\n", "utf8");`,
    `    } catch {`,
    `      return { block: true, reason: "UH tool guard audit log could not be written; refusing the tool call" };`,
    `    }`,
    `    return allowed ? undefined : { block: true, reason: entry.reason };`,
    `  });`,
    `}`,
    ``,
  ].join("\n");
}

/** Write a functional, self-contained guard hook at the snapshot path `hookPath`. */
export async function writeGuardHookFixture(hookPath: string): Promise<void> {
  const name = hookPath.split(/[\\/]/).pop();
  if (name === "cmdc-hook.js") { await writeFile(hookPath, subprocessHook("cmdc-hook.ts"), "utf8"); return; }
  if (name === "claude-code-hook.js") { await writeFile(hookPath, subprocessHook("claude-code-hook.ts"), "utf8"); return; }
  if (name === "omp.js") { await writeFile(hookPath, extensionHook(), "utf8"); return; }
  throw new Error(`No guard hook fixture for ${hookPath}`);
}
