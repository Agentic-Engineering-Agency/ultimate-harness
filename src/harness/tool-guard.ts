import path from "node:path";
import type { ToolGuardPolicy } from "../schema/runtime-control.js";
import { DEFAULT_PROTECTED_PATHS } from "../schema/runtime-control.js";

export type ToolGuardClass =
  | "write_outside" | "git_mutation" | "delete_outside" | "kill_or_format"
  | "package_install" | "network_client" | "agent_client" | "protected_root";
export type ToolGuardDecision = { deny?: { reason: string; class: ToolGuardClass; target?: string } };

const SUFFIX = " Do not retry this by another route; record it in your final message and continue with the rest of the task.";
export const SHELL_TOOLS = new Set(["bash", "shell", "shell_command", "powershell", "pwsh", "cmd", "run_command"]);
export const WRITE_TOOLS = new Set(["write_file", "edit_file", "notebook_edit", "multi_edit", "write", "edit", "create_file", "apply_patch", "delete_file", "remove", "move_file"]);
const DELETE_TOOLS = new Set(["delete_file", "remove"]);
const DEL_VERBS = new Set(["remove-item", "ri", "rm", "rmdir", "rd", "del", "erase"]);
const COPY_VERBS = new Set(["copy", "cp", "move", "mv", "xcopy", "robocopy", "copy-item", "move-item", "cpi", "mi"]);
const NULL_TARGETS = new Set(["nul", "null", "/dev/null", "$null", "&1", "&2", "con", "prn"]);
const VALUE_FLAGS = new Set(["-erroraction", "-warningaction", "-filter", "-include", "-exclude", "-encoding", "-confirm", "-ea", "-wa", "-value", "-inputobject", "-variable"]);

function splitSegments(command: string): Array<[string, string]> {
  const result: Array<[string, string]> = [];
  let current = "", separator = "", quote = "";
  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i];
    if (quote) {
      current += ch;
      if (ch === "\\" && quote === '"' && i + 1 < command.length) current += command[++i];
      else if (ch === quote) quote = "";
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; current += ch; continue; }
    const two = command.slice(i, i + 2);
    if (two === "&&" || two === "||") { result.push([current, separator]); current = ""; separator = two; i += 1; continue; }
    if (["|", ";", "&", "{", "}"].includes(ch)) { result.push([current, separator]); current = ""; separator = ch; continue; }
    current += ch;
  }
  result.push([current, separator]);
  return result;
}

function tokens(command: string): string[] {
  return command.match(/'[^']*'|"(?:[^"\\]|\\.)*"|\S+/g)?.map(t => t.replace(/^['"]|['"]$/g, "")) ?? [];
}

function unwrap(command: string): string[] {
  const out = [command];
  for (const [segment] of splitSegments(command)) {
    const ts = tokens(segment);
    if (!ts.length) continue;
    const head = path.basename(ts[0]).toLowerCase();
    if (!["powershell", "powershell.exe", "pwsh", "pwsh.exe", "cmd", "cmd.exe"].includes(head)) continue;
    for (let i = 1; i < ts.length; i += 1) {
      if (![ "-command", "-c", "/c", "/k", "-encodedcommand" ].includes(ts[i].toLowerCase())) continue;
      let body = ts.slice(i + 1).join(" ").trim();
      if (body.startsWith('\\"') && body.endsWith('\\"')) body = body.slice(2, -2);
      else if (body.length >= 2 && ((body.startsWith('"') && body.endsWith('"')) || (body.startsWith("'") && body.endsWith("'")))) body = body.slice(1, -1);
      body = body.replaceAll('\\"', '"').replaceAll('`"', '"');
      if (body) out.push(...unwrap(body));
      break;
    }
  }
  return out;
}

function assignments(command: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const match of command.matchAll(/\$(\w+)\s*=\s*['"]([^'"]+)['"]/g)) result.set(match[1].toLowerCase(), match[2]);
  for (const match of command.matchAll(/\$(\w+)\s*=\s*([^;&|]+)/g)) result.set(match[1].toLowerCase(), match[2].trim());
  for (const match of command.matchAll(/\bset\s+(\w+)=([^\s&;]+)/gi)) result.set(match[1].toLowerCase(), match[2]);
  return result;
}

function resolveToken(value: string, vars: Map<string, string>): string | undefined {
  const clean = value.replace(/^['"]|['"]$/g, "");
  const match = clean.match(/^\$\{?(\w+)\}?((?:.*))$/);
  if (!match) return clean;
  const base = vars.get(match[1].toLowerCase());
  return base === undefined ? undefined : `${base}${match[2]}`;
}

function cleanTargets(values: string[], vars: Map<string, string>): string[] {
  return values.map(v => resolveToken(v, vars)).filter((v): v is string => Boolean(v)).map(v => v.replace(/^\d+/, "").replace(/^>/, "")).filter(v => v && !NULL_TARGETS.has(v.toLowerCase()) && !v.startsWith("&"));
}

function redirectionTargets(command: string): string[] {
  const targets: string[] = [];
  let quote = "";
  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i];
    if (quote) {
      if (ch === "\\" && quote === '"' && i + 1 < command.length) i += 1;
      else if (ch === quote) quote = "";
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; continue; }
    if (ch !== ">") continue;
    if (i > 0 && /\d/.test(command[i - 1])) i -= 1;
    if (command[i] === ">" && command[i + 1] === ">") i += 1;
    i += 1;
    while (i < command.length && /\s/.test(command[i])) i += 1;
    const start = i;
    while (i < command.length && !/[\s;&|]/.test(command[i])) i += 1;
    if (i > start) targets.push(command.slice(start, i));
    i -= 1;
  }
  return targets;
}

function writeTargets(command: string): string[] {
  const out: string[] = [];
  const vars = assignments(command);
  for (const body of unwrap(command)) {
    out.push(...redirectionTargets(body));
    for (const [segment] of splitSegments(body)) {
      const ts = tokens(segment);
      if (!ts.length) continue;
      const verb = ts[0].toLowerCase();
      if (COPY_VERBS.has(verb)) {
        const positional = ts.slice(1).filter(t => !t.startsWith("-") && !t.startsWith("/"));
        if (positional.length) out.push(positional.at(-1)!);
        const destination = ts.findIndex(t => t.toLowerCase() === "-destination");
        if (destination >= 0 && ts[destination + 1]) out[out.length - 1] = ts[destination + 1];
      }
      for (let i = 0; i < ts.length; i += 1) {
        const t = ts[i];
        if ((t === ">" || t === ">>") && ts[i + 1]) out.push(ts[++i]);
        else if (t.startsWith(">") && !t.startsWith(">>") && t.length > 1) out.push(t.slice(1));
        else if (t.startsWith(">>") && t.length > 2) out.push(t.slice(2));
        else if (["out-file", "set-content", "add-content", "tee", "tee-object"].includes(t.toLowerCase())) {
          const rest = ts.slice(i + 1); const low = rest.map(x => x.toLowerCase());
          const flag = ["-path", "-filepath", "-literalpath"].find(f => low.includes(f));
          if (flag && rest[low.indexOf(flag) + 1]) out.push(rest[low.indexOf(flag) + 1]);
          else for (let j = 0; j < rest.length; j += 1) {
            if (rest[j].startsWith("-")) { if (VALUE_FLAGS.has(rest[j].toLowerCase())) j += 1; continue; }
            out.push(rest[j]); break;
          }
        }
      }
    }
  }
  return cleanTargets(out, vars);
}

function deleteTargets(command: string): { targets: string[]; unresolved: boolean } {
  const vars = assignments(command); const targets: string[] = []; let unresolved = false;
  const bodies = unwrap(command).flatMap(body => splitSegments(body));
  for (let i = 0; i < bodies.length; i += 1) {
    const [segment, separator] = bodies[i]; const ts = tokens(segment); if (!ts.length || !DEL_VERBS.has(ts[0].toLowerCase())) continue;
    let args: string[] = [];
    for (let j = 1; j < ts.length; j += 1) {
      const t = ts[j], low = t.toLowerCase();
      if ((low === "-path" || low === "-literalpath") && ts[j + 1]) { args.push(...ts[++j].split(",")); continue; }
      if (VALUE_FLAGS.has(low) || VALUE_FLAGS.has(low.split(":")[0])) { if (!t.includes(":")) j += 1; continue; }
      if (t.startsWith("-") || t.startsWith("/")) continue;
      args.push(...t.split(","));
    }
    if (args.length === 0 && separator === "|" && i > 0) {
      const previous = tokens(bodies[i - 1][0]);
      if (previous.length && ["get-childitem", "gci", "ls", "dir", "get-item", "gi"].includes(previous[0].toLowerCase())) args = previous.slice(1).filter(t => !t.startsWith("-"));
    }
    if (!args.length) unresolved = true; else targets.push(...cleanTargets(args, vars));
  }
  return { targets, unresolved };
}

/**
 * One canonical comparison form for paths, independent of the host running UH.
 * The guard judges commands written for whatever platform the agent targets,
 * so a `C:\worker` root and an `out\x` target must relate the same way on
 * Linux CI as they do on Windows.
 */
function normalized(value: string, root: string): string {
  const raw = value.replaceAll("\\", "/");
  const base = root.replaceAll("\\", "/").replace(/\/+$/, "");
  const absolute = /^[a-zA-Z]:\//.test(raw) || raw.startsWith("/");
  const segments: string[] = [];
  for (const segment of (absolute ? raw : `${base}/${raw}`).split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") { segments.pop(); continue; }
    segments.push(segment.toLowerCase());
  }
  return segments.join("/");
}
function inside(value: string, root: string, roots: string[]): boolean {
  const candidate = normalized(value, root);
  return roots.some(r => { const base = normalized(r, root); return candidate === base || candidate.startsWith(`${base}/`); });
}
function protectedRoot(value: string, root: string, roots: string[]): string | undefined {
  const candidate = normalized(value, root);
  return roots.find(r => { const base = normalized(r, root); return candidate === base || candidate.startsWith(`${base}/`); });
}
function reason(className: ToolGuardClass, policy: ToolGuardPolicy, target = ""): ToolGuardDecision {
  const roots = policy.write_roots.join(", ");
  const text = className === "write_outside" ? `CONTRACT: write only under ${roots}. Put the file under ${policy.write_roots[0]} instead.`
    : className === "git_mutation" ? "CONTRACT: no git mutations; the harness commits for you. Use read-only git (status, diff, log) or skip it."
    : className === "delete_outside" || className === "kill_or_format" ? `CONTRACT: deletes and process kills only inside ${roots}.`
    : className === "package_install" ? "CONTRACT: no package installs. Use what is installed; if a dependency is missing, end with BLOCKED: <dependency>."
    : className === "agent_client" || className === "network_client" ? "CONTRACT: no network or agent clients. Everything you need is on disk; if it is not, end with BLOCKED: <what is missing>."
    : `CONTRACT: ${target || "path"} belongs to the harness and is read-only.`;
  return { deny: { class: className, target: target || undefined, reason: text + SUFFIX } };
}
function gitMutation(command: string): boolean {
  const tokens = command.match(/"[^"]*"|'[^']*'|\S+/g)?.map(token => token.replace(/^['"]|['"]$/g, "")) ?? [];
  const git = tokens.findIndex(token => token.toLowerCase() === "git");
  if (git < 0) return false;
  const valueOptions = new Set(["-c", "-C", "--git-dir", "--work-tree", "--namespace"]);
  const mutations = new Set(["commit", "checkout", "stash", "reset", "add", "merge", "rebase", "push", "switch", "restore", "clean"]);
  for (let i = git + 1; i < tokens.length; i += 1) {
    const token = tokens[i].toLowerCase();
    if (token.startsWith("-")) {
      if (valueOptions.has(token)) i += 1;
      continue;
    }
    return mutations.has(token);
  }
  return false;
}
export type ControllerGuardOptions = { allowControllerCommands?: boolean };

function isControllerCommand(command: string): boolean {
  if (!command || /[\r\n;&|`<>]/.test(command)) return false;
  const commandTokens = tokens(command);
  if (commandTokens[0] === "&") commandTokens.shift();
  if (!commandTokens.length) return false;
  const executable = commandTokens[0].replaceAll("\\", "/").toLowerCase();
  let argumentIndex = 1;
  if (path.basename(executable) === "node" || path.basename(executable) === "node.exe" ||
      path.basename(executable) === "bun" || path.basename(executable) === "bun.exe") {
    const script = commandTokens[1]?.replaceAll("\\", "/").toLowerCase() ?? "";
    if (!script.endsWith("/dist/cli.js") && script !== "dist/cli.js") return false;
    argumentIndex = 2;
  } else if (!["uh", "uh.cmd", "uh.exe"].includes(path.basename(executable))) {
    return false;
  }
  const operation = commandTokens[argumentIndex]?.toLowerCase();
  if (!operation || !new Set(["acceptance", "adapter", "init", "mission", "observatory", "propose", "sandbox", "skill", "spec", "status", "validate", "verify"]).has(operation)) return false;
  return !commandTokens.some(token => /^(?:--force|--yolo|--dangerously|--bypass|--permission-prompts(?:=|$))/i.test(token));
}

export function decideToolCall(
  policy: ToolGuardPolicy,
  toolName: string,
  input: unknown,
  workerRoot: string,
  options: ControllerGuardOptions = {},
): ToolGuardDecision {
  const args = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const lowerTool = toolName.toLowerCase();
  const protectedPaths = [...DEFAULT_PROTECTED_PATHS, ...(policy as ToolGuardPolicy & { protected_paths?: string[] }).protected_paths ?? []];
  const directTarget = ["file_path", "path", "directory", "cwd", "notebook_path"].map(k => args[k]).find(v => typeof v === "string" && v) as string | undefined;
  if (WRITE_TOOLS.has(lowerTool) && directTarget) {
    const protectedPath = protectedRoot(directTarget, workerRoot, protectedPaths);
    if (protectedPath) return reason("protected_root", policy, protectedPath);
    if (DELETE_TOOLS.has(lowerTool) && !inside(directTarget, workerRoot, policy.write_roots)) return reason("delete_outside", policy, directTarget);
    if (!DELETE_TOOLS.has(lowerTool) && !inside(directTarget, workerRoot, policy.write_roots)) return reason("write_outside", policy, directTarget);
  }
  if (!SHELL_TOOLS.has(lowerTool)) return {};
  const command = `${typeof args.command === "string" ? args.command : ""} ${Array.isArray(args.args) ? args.args.map(String).join(" ") : ""}`.trim();
  if (options.allowControllerCommands && isControllerCommand(command)) return {};
  if (policy.deny_git_mutations && gitMutation(command)) return reason("git_mutation", policy);
  if (policy.deny_package_installs && /\b(?:pip|pip3|uv|conda|npm|pnpm|yarn)\s+(?:install|add|i)\b/i.test(command)) return reason("package_install", policy);
  const executableClients = policy.agent_clients.map(x => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  if (policy.deny_network_clients && /\b(?:curl|wget|invoke-webrequest|iwr|invoke-restmethod|irm)\b/i.test(command)) return reason("network_client", policy);
  if (policy.deny_network_clients && executableClients && new RegExp(`(?:^|[\\s"'])(${executableClients})(?:\\s|$)`, "i").test(command)) return reason("agent_client", policy);
  if (/\b(?:taskkill|stop-process|kill\s+-9)\b|\bformat\s+[a-z]:/i.test(command)) return reason("kill_or_format", policy);
  const deletes = deleteTargets(command);
  for (const target of deletes.targets) {
    const protectedPath = protectedRoot(target, workerRoot, protectedPaths);
    if (protectedPath) return reason("protected_root", policy, protectedPath);
    if (!inside(target, workerRoot, policy.write_roots)) return reason("delete_outside", policy, target);
  }
  if (deletes.unresolved) return reason("delete_outside", policy);
  for (const target of writeTargets(command)) {
    const protectedPath = protectedRoot(target, workerRoot, protectedPaths);
    if (protectedPath) return reason("protected_root", policy, protectedPath);
    if (!inside(target, workerRoot, policy.write_roots)) return reason("write_outside", policy, target);
  }
  return {};
}

export function toolTargetForLog(toolName: string, input: unknown): string {
  const args = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
  for (const key of ["file_path", "path", "directory", "cwd", "notebook_path", "command"]) if (typeof args[key] === "string") return args[key] as string;
  return toolName;
}
