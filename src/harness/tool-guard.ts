import path from "node:path";
import type { ToolGuardPolicy } from "../schema/runtime-control.js";
import { DEFAULT_PROTECTED_PATHS } from "../schema/runtime-control.js";

export type ToolGuardClass =
  | "write_outside" | "git_mutation" | "delete_outside" | "kill_or_format"
  | "package_install" | "network_client" | "agent_client" | "protected_root"
  | "guard_tamper" | "containment_escape" | "virtual_device";
export type ToolGuardDecision = { deny?: { reason: string; class: ToolGuardClass; target?: string } };
export type ToolGuardLogLine = {
  ts: string;
  call_id?: string;
  tool: string;
  class: ToolGuardClass | "allow";
  target?: string;
  reason?: string;
};

const SUFFIX = " Do not retry this by another route; record it in your final message and continue with the rest of the task.";
export const SHELL_TOOLS = new Set(["bash", "shell", "shell_command", "powershell", "pwsh", "cmd", "run_command"]);
export const WRITE_TOOLS = new Set(["write_file", "edit_file", "notebook_edit", "multi_edit", "write", "edit", "create_file", "apply_patch", "delete_file", "remove", "move_file"]);
const DELETE_TOOLS = new Set(["delete_file", "remove"]);
/** Native tools that start another agent inside the runtime. Judged by tool name only. */
export const AGENT_TOOLS = new Set(["task", "agent", "subagent", "spawn_agent", "dispatch_agent", "delegate"]);
const DEL_VERBS = new Set(["remove-item", "ri", "rm", "rmdir", "rd", "del", "erase"]);
const COPY_VERBS = new Set(["copy", "cp", "move", "mv", "xcopy", "robocopy", "copy-item", "move-item", "cpi", "mi"]);
/** cmd.exe verbs whose `/x` tokens are switches. POSIX `rm`, `cp` and `mv` never take them, so `/etc/x` stays a path. */
const CMD_SWITCH_VERBS = new Set(["rmdir", "rd", "del", "erase", "copy", "move", "xcopy", "robocopy"]);
function isSwitch(verb: string, token: string): boolean {
  return token.startsWith("-") || (CMD_SWITCH_VERBS.has(verb) && /^\/[a-z?][a-z0-9]*(?::[^/\\]*)?$/i.test(token));
}
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


const NESTED_SHELLS = new Set(["bash", "sh", "zsh", "dash", "powershell", "pwsh", "cmd"]);
const NESTED_SHELL_FLAGS = new Set(["-command", "-c", "/c", "/k", "-lc"]);
const LAUNCHERS = new Set(["&", ".", "npx", "bunx", "uvx", "pipx", "env", "sudo", "nohup", "time", "exec", "call", "start", "command", "xargs", "start-process", "saps"]);
const PACKAGE_RUNNERS = new Set(["pnpm", "yarn", "npm", "bun"]);
const PACKAGE_RUNNER_VERBS = new Set(["dlx", "exec", "x"]);
const SCRIPT_HOSTS = new Set(["node", "bun", "deno", "tsx"]);
const UH_SPAWN_OPERATIONS = new Set(["run", "run-all", "run-team"]);

/** Executable identity of a command token: basename, lowercased, without a Windows launcher extension. */
function executableName(token: string): string {
  const base = token.replaceAll("\\", "/").split("/").at(-1) ?? "";
  return base.toLowerCase().replace(/\.(?:exe|cmd|bat|com|ps1)$/, "");
}

/** Bodies of `$(...)` and backtick substitutions. Single-quoted text is literal and never scanned. */
function substitutions(command: string): string[] {
  const bodies: string[] = [];
  let single = false;
  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i];
    if (ch === "'") { single = !single; continue; }
    if (single) continue;
    if (ch === "$" && command[i + 1] === "(") {
      let depth = 1, j = i + 2;
      for (; j < command.length && depth > 0; j += 1) {
        if (command[j] === "(") depth += 1;
        else if (command[j] === ")") depth -= 1;
      }
      bodies.push(command.slice(i + 2, depth === 0 ? j - 1 : j));
      i += 1;
    } else if (ch === "`") {
      const end = command.indexOf("`", i + 1);
      if (end < 0) break;
      bodies.push(command.slice(i + 1, end));
      i = end;
    }
  }
  return bodies;
}

/** A UH invocation that starts paid runtimes. Read-only UH commands such as `validate` and `status` are not spawns. */
function uhSpawn(args: string[]): boolean {
  const positional = args.filter(t => !t.startsWith("-")).map(t => t.toLowerCase());
  if (positional[0] === "mission") return UH_SPAWN_OPERATIONS.has(positional[1] ?? "");
  return positional[0] === "acceptance" && positional[1] === "run";
}

/**
 * True when a command would start an agent client. Only executable positions are
 * judged: the head of each shell segment, what a launcher or nested shell would
 * run, and command substitutions. A client name that appears as an argument,
 * a search pattern or a path is not an invocation.
 */
function agentClientInvoked(command: string, clients: ReadonlySet<string>, depth = 0): boolean {
  if (!clients.size || depth > 4) return false;
  for (const body of substitutions(command)) if (agentClientInvoked(body, clients, depth + 1)) return true;
  for (const [segment] of splitSegments(command)) {
    const ts = tokens(segment);
    let i = 0;
    while (i < ts.length) {
      if (/^\w+=/.test(ts[i])) { i += 1; continue; }
      const name = executableName(ts[i]);
      if (clients.has(name)) return true;
      if (name === "uh") { if (uhSpawn(ts.slice(i + 1))) return true; break; }
      if (NESTED_SHELLS.has(name)) {
        const flag = ts.findIndex((t, index) => index > i && NESTED_SHELL_FLAGS.has(t.toLowerCase()));
        if (flag >= 0 && agentClientInvoked(ts.slice(flag + 1).join(" "), clients, depth + 1)) return true;
        break;
      }
      if (SCRIPT_HOSTS.has(name)) {
        const rest = ts.slice(i + 1).filter(t => !t.startsWith("-"));
        if (rest[0]?.toLowerCase() === "run") rest.shift();
        const script = (rest[0] ?? "").replaceAll("\\", "/").toLowerCase();
        if ((script === "dist/cli.js" || script.endsWith("/dist/cli.js")) && uhSpawn(rest.slice(1))) return true;
        if (!(PACKAGE_RUNNERS.has(name) && PACKAGE_RUNNER_VERBS.has((ts[i + 1] ?? "").toLowerCase()))) break;
      }
      if (PACKAGE_RUNNERS.has(name) && PACKAGE_RUNNER_VERBS.has((ts[i + 1] ?? "").toLowerCase())) { i += 2; }
      else if (LAUNCHERS.has(name)) { i += 1; }
      else break;
      // Launcher flags may carry a value, so the token after a flag is judged as well as the next one.
      let afterFlag = false;
      while (i < ts.length && (ts[i].startsWith("-") || /^\w+=/.test(ts[i]))) { afterFlag = ts[i].startsWith("-"); i += 1; }
      if (afterFlag && i + 1 < ts.length && clients.has(executableName(ts[i + 1]))) return true;
    }
  }
  return false;
}

const CONTAINMENT_SCHEDULERS = new Set(["setsid", "systemd-run", "disown", "at", "batch"]);
const CONTAINMENT_TASK_SERVICES = new Set(["register-scheduledtask", "start-scheduledtask", "new-service", "start-service"]);

/** Whether the arguments of a `wmic` invocation request `Win32_Process.Create`. */
function wmicCreatesProcess(args: string[]): boolean {
  const low = args.map(t => t.toLowerCase());
  return low.some((t, i) => t === "process" && low[i + 1] === "call" && low[i + 2] === "create");
}

/** Whether a WMI process-creation cmdlet names both `Win32_Process` and `Create`. */
function cimMethodCreatesProcess(name: string, args: string[]): boolean {
  if (name !== "invoke-cimmethod" && name !== "invoke-wmimethod") return false;
  return args.some(t => t.toLowerCase().includes("win32_process"))
    && args.some(t => { const low = t.toLowerCase(); return low === "create" || low.endsWith(":create"); });
}

/** Whether the executable `name` with these arguments would launch outside the supervised tree. */
function containmentSpawnerInvoked(name: string, args: string[]): boolean {
  if (CONTAINMENT_SCHEDULERS.has(name) || CONTAINMENT_TASK_SERVICES.has(name)) return true;
  if (name === "crontab") return (args[0] ?? "").toLowerCase() !== "-l";
  if (name === "sc") return args.some(t => { const low = t.toLowerCase(); return low === "create" || low === "start"; });
  if (name === "schtasks") return args.some(t => /^[-/](?:create|run)$/i.test(t));
  if (name === "wmic") return wmicCreatesProcess(args);
  return cimMethodCreatesProcess(name, args);
}

/**
 * True when a command would launch a process outside the supervised job or
 * process tree: WMI process creation, scheduled tasks, services, and detached
 * or scheduled POSIX launches. Executable positions are judged exactly the way
 * agent clients are judged: the head of each shell segment, what a launcher or
 * nested shell would run, and command substitutions. A launch name that
 * appears as an argument, a search pattern or a path is not an invocation.
 */
function containmentEscapeInvoked(command: string, depth = 0): boolean {
  if (depth > 4) return false;
  for (const body of substitutions(command)) if (containmentEscapeInvoked(body, depth + 1)) return true;
  const bodies = splitSegments(command);
  for (let s = 0; s < bodies.length; s += 1) {
    const [segment] = bodies[s];
    const ts = tokens(segment);
    if (!ts.length) continue;
    // The [wmiclass] cast is the executable position of PowerShell WMI object construction.
    if (ts.some(t => /\[wmiclass\]/i.test(t)) && /win32_process/i.test(segment) && /\.create\s*\(/i.test(segment)) return true;
    const backgrounded = s + 1 < bodies.length && bodies[s + 1][1] === "&";
    let i = 0;
    while (i < ts.length) {
      if (/^\w+=/.test(ts[i])) { i += 1; continue; }
      const name = executableName(ts[i]);
      // nohup stays in the process group exactly until its segment is backgrounded.
      if (name === "nohup" && backgrounded) return true;
      if (containmentSpawnerInvoked(name, ts.slice(i + 1))) return true;
      if (NESTED_SHELLS.has(name)) {
        const flag = ts.findIndex((t, index) => index > i && NESTED_SHELL_FLAGS.has(t.toLowerCase()));
        if (flag >= 0 && containmentEscapeInvoked(ts.slice(flag + 1).join(" "), depth + 1)) return true;
        break;
      }
      if (SCRIPT_HOSTS.has(name) && !(PACKAGE_RUNNERS.has(name) && PACKAGE_RUNNER_VERBS.has((ts[i + 1] ?? "").toLowerCase()))) break;
      if (PACKAGE_RUNNERS.has(name) && PACKAGE_RUNNER_VERBS.has((ts[i + 1] ?? "").toLowerCase())) { i += 2; }
      else if (LAUNCHERS.has(name)) { i += 1; }
      else break;
      // Launcher flags may carry a value, so the token after a flag is judged as well as the next one.
      let afterFlag = false;
      while (i < ts.length && (ts[i].startsWith("-") || /^\w+=/.test(ts[i]))) { afterFlag = ts[i].startsWith("-"); i += 1; }
      if (afterFlag && i + 1 < ts.length && containmentSpawnerInvoked(executableName(ts[i + 1]), ts.slice(i + 2))) return true;
    }
  }
  return false;
}

type DirectoryState = { current?: string; unknown: boolean; stack: Array<{ current?: string; unknown: boolean }> };
type ShellTarget = { value: string; resolved?: string; ignored?: boolean };

const GUARD_ENV_NAMES = new Set(["UH_TOOL_GUARD_POLICY", "UH_TOOL_GUARD_LOG"]);

/** The configured value of a guard-owned environment variable, when it is set. */
function guardEnvValue(name: string): string | undefined {
  const upper = name.toUpperCase();
  if (!GUARD_ENV_NAMES.has(upper)) return undefined;
  const value = process.env[upper];
  return value ? value : undefined;
}

/**
 * The value a bare guard-environment reference resolves to: `$env:NAME`,
 * `$NAME`, or `%NAME%` for the two names the guard owns. Any other
 * environment reference stays unresolved.
 */
function guardEnvReference(value: string): string | undefined {
  const clean = value.trim().replace(/^['"]|['"]$/g, "");
  const match = clean.match(/^(?:\$env:|\$)([A-Za-z_]\w*)$/) ?? clean.match(/^%([A-Za-z_]\w*)%$/);
  return match ? guardEnvValue(match[1]) : undefined;
}

function assignments(command: string): Map<string, string> {
  const result = new Map<string, string>();
  const addLiteral = (name: string, value: string): void => {
    const clean = value.trim().replace(/^['"]|['"]$/g, "");
    if (!clean) return;
    const environment = guardEnvReference(clean);
    if (environment !== undefined) { result.set(name.toLowerCase(), environment); return; }
    if (clean.startsWith("$") || clean.startsWith("%") || clean.startsWith("~") || clean.includes("`") || clean.includes("$(")) return;
    result.set(name.toLowerCase(), clean);
  };
  for (const match of command.matchAll(/\$(\w+)\s*=\s*['"]([^'"]+)['"]/g)) addLiteral(match[1], match[2]);
  for (const match of command.matchAll(/\$(\w+)\s*=\s*([^;&|]+)/g)) addLiteral(match[1], match[2]);
  for (const match of command.matchAll(/\bset\s+(\w+)=([^\s&;]+)/gi)) addLiteral(match[1], match[2]);
  for (const match of command.matchAll(/(?:^|[^\w])(\w+)\s*=\s*(\$env:\w+|\$\w+|%\w+%)/g)) {
    const environment = guardEnvReference(match[2]);
    if (environment !== undefined) result.set(match[1].toLowerCase(), environment);
  }
  return result;
}
function resolveToken(value: string, vars: Map<string, string>): string | undefined {
  const clean = value.replace(/^['"]|['"]$/g, "");
  if (!clean || clean === "-" || clean.startsWith("~") || clean.includes("$(") || clean.includes("`")) return undefined;
  const windowsVariable = clean.match(/^%(\w+)%((?:.*))$/);
  if (windowsVariable) {
    const base = guardEnvValue(windowsVariable[1]) ?? vars.get(windowsVariable[1].toLowerCase());
    return base === undefined ? undefined : `${base}${windowsVariable[2]}`;
  }
  if (/%[^%]+%/.test(clean)) return undefined;
  const environmentReference = clean.match(/^\$env:(\w+)\b(.*)$/i);
  if (environmentReference) {
    const base = guardEnvValue(environmentReference[1]);
    return base === undefined ? undefined : `${base}${environmentReference[2]}`;
  }
  const match = clean.match(/^\$(\w+)\b(.*)$/);
  if (!match) return clean;
  const base = vars.get(match[1].toLowerCase()) ?? guardEnvValue(match[1]);
  return base === undefined ? undefined : `${base}${match[2]}`;
}

function staticDirectory(value: string, base: string | undefined, workerRoot: string, vars: Map<string, string>): string | undefined {
  const resolved = resolveToken(value, vars);
  if (resolved === undefined) return undefined;
  return normalized(resolved, base ?? workerRoot);
}

function absolutePath(value: string): boolean {
  return value.startsWith("/") || value.startsWith("\\\\") || /^[a-zA-Z]:[\\/]/.test(value);
}

function redirectionTargets(command: string): string[] {
  const targets: string[] = [];
  let quote = "";
  for (let index = 0; index < command.length; index += 1) {
    const character = command[index];
    if (quote) {
      if (character === "\\" && quote === '"' && index + 1 < command.length) index += 1;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === "'" || character === '"') { quote = character; continue; }
    if (character !== ">") continue;
    if (index > 0 && /\d/.test(command[index - 1])) index -= 1;
    if (command[index] === ">" && command[index + 1] === ">") index += 1;
    index += 1;
    while (index < command.length && /\s/.test(command[index])) index += 1;
    const start = index;
    while (index < command.length && !/[\s;&|]/.test(command[index])) index += 1;
    if (index > start) targets.push(command.slice(start, index));
    index -= 1;
  }
  return targets;
}

function shellTarget(value: string, state: DirectoryState, workerRoot: string, vars: Map<string, string>): ShellTarget {
  const cleanValue = value.replace(/^\d+/, "").replace(/^>/, "");
  const resolved = resolveToken(cleanValue, vars);
  if (!cleanValue || NULL_TARGETS.has(cleanValue.toLowerCase()) || cleanValue.startsWith("&")) return { value: cleanValue, ignored: true };
  if (resolved === undefined || state.unknown) return { value: cleanValue };
  if (absolutePath(resolved)) return { value: cleanValue, resolved: normalized(resolved, workerRoot) };
  if (state.current === undefined) return { value: cleanValue };
  return { value: cleanValue, resolved: normalized(resolved, state.current) };
}
function commandBody(segment: string): string | undefined {
  const ts = tokens(segment);
  if (!ts.length) return undefined;
  const head = executableName(ts[0]);
  if (!NESTED_SHELLS.has(head)) return undefined;
  const flag = ts.findIndex((token, index) => index > 0 && NESTED_SHELL_FLAGS.has(token.toLowerCase()));
  if (flag < 0) return undefined;
  let body = ts.slice(flag + 1).join(" ").trim();
  if (body.startsWith('\\"') && body.endsWith('\\"')) body = body.slice(2, -2);
  else if (body.length >= 2 && ((body.startsWith('"') && body.endsWith('"')) || (body.startsWith("'") && body.endsWith("'")))) body = body.slice(1, -1);
  return body.replaceAll('\\"', '"').replaceAll('`"', '"') || undefined;
}

function directoryArgument(ts: string[]): string | undefined {
  const flag = ts.findIndex(token => ["-path", "-literalpath"].includes(token.toLowerCase()));
  if (flag >= 0) return ts[flag + 1];
  return ts.slice(1).find(token => !["/d", "-d"].includes(token.toLowerCase()) && !token.startsWith("-"));
}

function applyDirectoryChange(segment: string, state: DirectoryState, workerRoot: string, vars: Map<string, string>): void {
  const ts = tokens(segment);
  if (!ts.length) return;
  const verb = executableName(ts[0]);
  if (verb === "popd" || verb === "pop-location") {
    const previous = state.stack.pop();
    state.current = previous?.current;
    state.unknown = previous?.unknown ?? false;
    return;
  }
  if (!["cd", "chdir", "pushd", "set-location", "sl", "push-location"].includes(verb)) return;
  if (verb === "pushd" || verb === "push-location") {
    state.stack.push({ current: state.current, unknown: state.unknown });
  }
  const argument = directoryArgument(ts);
  const current = argument === undefined ? undefined : staticDirectory(argument, state.current, workerRoot, vars);
  state.current = current;
  state.unknown = argument === undefined || current === undefined;
}

function collectShellTargets(command: string, initialDirectory: string | undefined, workerRoot: string): {
  writes: ShellTarget[];
  deletes: ShellTarget[];
  unresolvedDelete: boolean;
} {
  const vars = assignments(command);
  const writes: ShellTarget[] = [];
  const deletes: ShellTarget[] = [];
  let unresolvedDelete = false;
  const scan = (body: string, initial: DirectoryState): void => {
    const segments = splitSegments(body);
    let previous: [string, string] | undefined;
    for (const [segment, separator] of segments) {
      const state: DirectoryState = { current: initial.current, unknown: initial.unknown, stack: [...initial.stack] };
      applyDirectoryChange(segment, state, workerRoot, vars);
      const ts = tokens(segment);
      if (ts.length) {
        for (const target of redirectionTargets(segment)) writes.push(shellTarget(target, state, workerRoot, vars));
        const verb = ts[0].toLowerCase();
        if (COPY_VERBS.has(verb)) {
          const positional = ts.slice(1).filter(token => !isSwitch(verb, token));
          let destination = positional.at(-1);
          const destinationFlag = ts.findIndex(token => token.toLowerCase() === "-destination");
          if (destinationFlag >= 0) destination = ts[destinationFlag + 1];
          if (destination) writes.push(shellTarget(destination, state, workerRoot, vars));
        }
        for (let index = 0; index < ts.length; index += 1) {
          const token = ts[index];
          if (token === ">" || token === ">>") {
            if (ts[index + 1]) writes.push(shellTarget(ts[++index], state, workerRoot, vars));
          } else if (token.startsWith(">") && !token.startsWith(">>") && token.length > 1) {
            writes.push(shellTarget(token.slice(1), state, workerRoot, vars));
          } else if (token.startsWith(">>") && token.length > 2) {
            writes.push(shellTarget(token.slice(2), state, workerRoot, vars));
          } else if (["out-file", "set-content", "add-content", "tee", "tee-object"].includes(token.toLowerCase())) {
            const rest = ts.slice(index + 1);
            const low = rest.map(item => item.toLowerCase());
            const flag = ["-path", "-filepath", "-literalpath"].find(item => low.includes(item));
            if (flag && rest[low.indexOf(flag) + 1]) writes.push(shellTarget(rest[low.indexOf(flag) + 1], state, workerRoot, vars));
            else {
              for (let offset = 0; offset < rest.length; offset += 1) {
                if (rest[offset].startsWith("-")) { if (VALUE_FLAGS.has(rest[offset].toLowerCase())) offset += 1; continue; }
                writes.push(shellTarget(rest[offset], state, workerRoot, vars));
                break;
              }
            }
          }
        }
        if (DEL_VERBS.has(verb)) {
          const args: string[] = [];
          for (let index = 1; index < ts.length; index += 1) {
            const token = ts[index], low = token.toLowerCase();
            if ((low === "-path" || low === "-literalpath") && ts[index + 1]) { args.push(...ts[++index].split(",")); continue; }
            if (VALUE_FLAGS.has(low) || VALUE_FLAGS.has(low.split(":")[0])) { if (!token.includes(":")) index += 1; continue; }
            if (isSwitch(verb, token)) continue;
            args.push(...token.split(","));
          }
          if (!args.length && separator === "|" && previous) {
            const priorTokens = tokens(previous[0]);
            if (priorTokens.length && ["get-childitem", "gci", "ls", "dir", "get-item", "gi"].includes(priorTokens[0].toLowerCase())) {
              args.push(...priorTokens.slice(1).filter(token => !token.startsWith("-")));
            }
          }
          if (!args.length) unresolvedDelete = true;
          for (const target of args) deletes.push(shellTarget(target, state, workerRoot, vars));
        }
      }
      const nested = commandBody(segment);
      if (nested) scan(nested, { current: state.current, unknown: state.unknown, stack: [...state.stack] });
      previous = [segment, separator];
      initial.current = state.current;
      initial.unknown = state.unknown;
      initial.stack = state.stack;
    }
  };
  scan(command, { current: initialDirectory, unknown: initialDirectory === undefined, stack: [] });
  return { writes, deletes, unresolvedDelete };
}

function writeTargets(command: string, initialDirectory: string | undefined, workerRoot: string): ShellTarget[] {
  return collectShellTargets(command, initialDirectory, workerRoot).writes;
}

function deleteTargets(command: string, initialDirectory: string | undefined, workerRoot: string): { targets: ShellTarget[]; unresolved: boolean } {
  const result = collectShellTargets(command, initialDirectory, workerRoot);
  return { targets: result.deletes, unresolved: result.unresolvedDelete };
}

/**
 * One canonical comparison form for paths, independent of the host running UH.
 * The guard judges commands written for whatever platform the agent targets,
 * so a `C:\worker` root and an `out\x` target must relate the same way on
 * Linux CI as they do on Windows.
 */
function normalized(value: string, root: string): string {
  const isWindows = /^[a-zA-Z]:[\\/]/.test(root) || root.startsWith("\\\\") || /^[a-zA-Z]:[\\/]/.test(value);
  let raw = isWindows ? value.replaceAll("\\", "/") : value;
  let base = isWindows ? root.replaceAll("\\", "/") : root;

  if (isWindows) {
    base = base.replace(/\/+$/, "");
    // Windows drive-relative syntax like "C:foo" or "C:..\bar"
    const driveRel = raw.match(/^([a-zA-Z]):(?!\/)(.*)/);
    if (driveRel) {
      const drive = driveRel[1].toLowerCase();
      const rest = driveRel[2];
      const baseDrive = base.match(/^([a-zA-Z]):/);
      if (baseDrive && baseDrive[1].toLowerCase() === drive) {
        raw = `${base}/${rest}`;
      } else {
        raw = `${drive}:/${rest}`;
      }
    }
  } else {
    base = base.replace(/\/+$/, "");
    if (base === "") base = "/";
  }

  const isAbs = /^[a-zA-Z]:\//.test(raw) || raw.startsWith("/");
  let combined = isAbs ? raw : (base === "/" ? `/${raw}` : `${base}/${raw}`);

  let prefix = "";
  if (/^[a-zA-Z]:\//.test(combined)) {
    prefix = combined.slice(0, 3).toLowerCase();
    combined = combined.slice(3);
  } else if (combined.startsWith("/")) {
    prefix = "/";
    combined = combined.slice(1);
  }

  const segments: string[] = [];
  for (const segment of combined.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") { segments.pop(); continue; }
    segments.push(isWindows ? segment.toLowerCase() : segment);
  }
  return prefix + segments.join("/");
}
function inside(value: string, root: string, roots: string[]): boolean {
  const candidate = normalized(value, root);
  return roots.some(r => {
    const base = normalized(r, root);
    if (base === "/" || /^[a-zA-Z]:\/$/.test(base)) {
      return candidate === base || candidate.startsWith(base);
    }
    return candidate === base || candidate.startsWith(`${base}/`);
  });
}
function protectedRoot(value: string, root: string, roots: string[]): string | undefined {
  const candidate = normalized(value, root);
  return roots.find(r => {
    const base = normalized(r, root);
    if (base === "/" || /^[a-zA-Z]:\/$/.test(base)) {
      return candidate === base || candidate.startsWith(base);
    }
    return candidate === base || candidate.startsWith(`${base}/`);
  });
}
const HARNESS_STATE_SEGMENTS = [".harness", ".commandcode", ".omp", ".pi"];

function pathSegments(value: string): string[] {
  return value.replaceAll("\\", "/").split("/").filter(Boolean).map(segment => segment.toLowerCase());
}

/** A target whose URI scheme is `xd:`, an OMP virtual device that has no filesystem path. */
function virtualDeviceTarget(value: string): boolean {
  return /^xd:/i.test(value.trim().replace(/^['"]|['"]$/g, ""));
}

function tamperTarget(target: ShellTarget, workerRoot: string): boolean {
  const candidate = target.resolved ?? target.value;
  const configured = [process.env.UH_TOOL_GUARD_POLICY, process.env.UH_TOOL_GUARD_LOG].filter(
    (value): value is string => Boolean(value),
  );
  if (configured.some(value => normalized(value, workerRoot) === normalized(candidate, workerRoot))) return true;
  // Harness state inside the worker root is the protected_root class, which supervision already hard-stops.
  if (target.resolved !== undefined && inside(candidate, workerRoot, ["."])) return false;
  if (absolutePath(target.value)) return pathSegments(candidate).some(segment => HARNESS_STATE_SEGMENTS.includes(segment));
  const segments = pathSegments(candidate);
  for (let index = 0; index < segments.length; index += 1) {
    if (!HARNESS_STATE_SEGMENTS.includes(segments[index])) continue;
    const stateRoot = segments.slice(0, index + 1).join("/");
    if (!inside(stateRoot, workerRoot, ["."]) && !inside(workerRoot, stateRoot, ["."])) return true;
  }
  return false;
}

function reason(className: ToolGuardClass, policy: ToolGuardPolicy, target = ""): ToolGuardDecision {
  const roots = policy.write_roots.join(", ");
  const text = className === "write_outside" ? `CONTRACT: write only under ${roots}. Put the file under ${policy.write_roots[0]} instead.`
    : className === "git_mutation" ? "CONTRACT: no git mutations; the harness commits for you. Use read-only git (status, diff, log) or skip it."
    : className === "delete_outside" || className === "kill_or_format" ? `CONTRACT: deletes and process kills only inside ${roots}.`
    : className === "package_install" ? "CONTRACT: no package installs. Use what is installed; if a dependency is missing, end with BLOCKED: <dependency>."
    : className === "agent_client" ? "CONTRACT: no sub-agents. Workers do not start agents, agent CLIs or harness runs. Do the work yourself; if part of it exceeds your scope, end with ESCALATE: <what your orchestrator should delegate>."
    : className === "network_client" ? "CONTRACT: no network or agent clients. Everything you need is on disk; if it is not, end with BLOCKED: <what is missing>."
    : className === "containment_escape" ? "CONTRACT: no launches outside the supervised process tree. Run the work in the foreground of this run instead."
    : className === "virtual_device" ? "CONTRACT: virtual devices are not available in this run."
    : className === "guard_tamper" ? "CONTRACT: the harness policy and its state are not yours to change."
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
  const explicitDirectory = ["cwd", "workdir", "directory"].map(key => args[key]).find(
    value => typeof value === "string" && value,
  ) as string | undefined;
  const directTarget = ["file_path", "path", "notebook_path", "directory", "cwd"].map(key => args[key]).find(
    value => typeof value === "string" && value,
  ) as string | undefined;
  if (WRITE_TOOLS.has(lowerTool) && directTarget) {
    const target = shellTarget(directTarget, {
      current: explicitDirectory ? staticDirectory(explicitDirectory, workerRoot, workerRoot, new Map()) : normalized(workerRoot, workerRoot),
      unknown: Boolean(explicitDirectory && staticDirectory(explicitDirectory, workerRoot, workerRoot, new Map()) === undefined),
      stack: [],
    }, workerRoot, new Map());
    const candidate = target.resolved ?? target.value;
    if (virtualDeviceTarget(directTarget)) return reason("virtual_device", policy, directTarget);
    if (tamperTarget(target, workerRoot)) return reason("guard_tamper", policy, directTarget);
    const protectedPath = protectedRoot(candidate, workerRoot, protectedPaths);
    if (protectedPath) return reason("protected_root", policy, protectedPath);
    if (!target.resolved || (DELETE_TOOLS.has(lowerTool) && !inside(candidate, workerRoot, policy.write_roots))) {
      return reason(DELETE_TOOLS.has(lowerTool) ? "delete_outside" : "write_outside", policy, directTarget);
    }
    if (!DELETE_TOOLS.has(lowerTool) && !inside(candidate, workerRoot, policy.write_roots)) return reason("write_outside", policy, directTarget);
  }
  if (AGENT_TOOLS.has(lowerTool) && policy.agent_clients.length && !policy.allow_native_subagents) return reason("agent_client", policy);
  if (!SHELL_TOOLS.has(lowerTool)) return {};
  const command = `${typeof args.command === "string" ? args.command : ""} ${Array.isArray(args.args) ? args.args.map(String).join(" ") : ""}`.trim();
  if (options.allowControllerCommands && isControllerCommand(command)) return {};
  if (policy.deny_git_mutations && gitMutation(command)) return reason("git_mutation", policy);
  if (policy.deny_package_installs && /\b(?:pip|pip3|uv|conda|npm|pnpm|yarn)\s+(?:install|add|i)\b/i.test(command)) return reason("package_install", policy);
  if (policy.deny_network_clients && /\b(?:curl|wget|invoke-webrequest|iwr|invoke-restmethod|irm)\b/i.test(command)) return reason("network_client", policy);
  if (containmentEscapeInvoked(command)) return reason("containment_escape", policy);
  if (agentClientInvoked(command, new Set(policy.agent_clients.map(client => executableName(client))))) return reason("agent_client", policy);
  if (/\b(?:taskkill|stop-process|kill\s+-9)\b|\bformat\s+[a-z]:/i.test(command)) return reason("kill_or_format", policy);
  const vars = assignments(command);
  const initialDirectory = explicitDirectory
    ? staticDirectory(explicitDirectory, workerRoot, workerRoot, vars)
    : normalized(workerRoot, workerRoot);
  const deletes = deleteTargets(command, initialDirectory, workerRoot);
  for (const target of deletes.targets) {
    if (target.ignored) continue;
    const candidate = target.resolved ?? target.value;
    if (virtualDeviceTarget(target.value)) return reason("virtual_device", policy, target.value);
    if (tamperTarget(target, workerRoot)) return reason("guard_tamper", policy, target.value);
    const protectedPath = protectedRoot(candidate, workerRoot, protectedPaths);
    if (protectedPath) return reason("protected_root", policy, protectedPath);
    if (!target.resolved || !inside(candidate, workerRoot, policy.write_roots)) return reason("delete_outside", policy, target.value);
  }
  if (deletes.unresolved) return reason("delete_outside", policy);
  for (const target of writeTargets(command, initialDirectory, workerRoot)) {
    if (target.ignored) continue;
    const candidate = target.resolved ?? target.value;
    if (virtualDeviceTarget(target.value)) return reason("virtual_device", policy, target.value);
    if (tamperTarget(target, workerRoot)) return reason("guard_tamper", policy, target.value);
    const protectedPath = protectedRoot(candidate, workerRoot, protectedPaths);
    if (protectedPath) return reason("protected_root", policy, protectedPath);
    if (!target.resolved || !inside(candidate, workerRoot, policy.write_roots)) return reason("write_outside", policy, target.value);
  }
  return {};
}

export function toolTargetForLog(toolName: string, input: unknown): string {
  const args = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
  for (const key of ["file_path", "path", "directory", "cwd", "notebook_path", "command"]) if (typeof args[key] === "string") return args[key] as string;
  return toolName;
}
