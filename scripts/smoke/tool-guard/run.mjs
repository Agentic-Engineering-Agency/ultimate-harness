import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const base = mkdtempSync(path.join(tmpdir(), "uh-tool-guard-"));
const policyPath = path.join(base, "tool-guard.json");
const logPath = path.join(base, "tool-guard.log");
writeFileSync(policyPath, JSON.stringify({
  schema_version: "uh.tool-guard.v0", write_roots: ["out"], deny_git_mutations: true,
  deny_package_installs: true, deny_network_clients: true, agent_clients: ["omp"], worker_root: base,
  protected_paths: [".harness", ".commandcode", ".omp", ".pi", ".git"],
}));
const env = { ...process.env, UH_TOOL_GUARD_POLICY: policyPath, UH_TOOL_GUARD_LOG: logPath };
const hook = path.join(repo, "dist", "extensions", "tool-guard", "cmdc-hook.js");
function run(input) {
  return spawnSync(process.execPath, [hook], { cwd: base, env, input: JSON.stringify(input), encoding: "utf8" });
}
const denied = run({ tool_name: "shell_command", tool_input: { command: "git commit -am x" } });
const allowed = run({ tool_name: "shell_command", tool_input: { command: "git status T:/forbidden" } });
if (denied.status !== 0 || !denied.stdout.includes('"permissionDecision":"deny"')) throw new Error("Command Code hook did not deny git mutation");
if (allowed.status !== 0 || allowed.stdout) throw new Error("Command Code hook denied read-only git");
process.env.UH_TOOL_GUARD_POLICY = policyPath;
process.env.UH_TOOL_GUARD_LOG = logPath;
const { default: extension } = await import(pathToFileURL(path.join(repo, "dist", "extensions", "tool-guard", "omp.js")).href);
let callback;
extension({ on(name, fn) { if (name === "tool_call") callback = fn; } });
const blocked = await callback({ toolName: "write_file", input: { file_path: ".harness/x", content: "forbidden path in report" } });
if (!blocked?.block || !blocked.reason.includes("Do not retry this by another route")) throw new Error("OMP extension did not block protected write");
if (!existsSync(logPath) || readFileSync(logPath, "utf8").trim().split("\n").length !== 3 || !readFileSync(logPath, "utf8").includes('"class":"allow"')) throw new Error("Guard log did not contain denial and allow evidence");
console.log("PASS tool-guard Command Code + OMP denials and log lines");
