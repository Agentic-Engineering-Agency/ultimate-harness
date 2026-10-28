import path from "node:path";
import type { ToolGuardPolicy } from "../schema/runtime-control.js";
import { DEFAULT_PROTECTED_PATHS } from "../schema/runtime-control.js";
import { harnessHiveDir } from "./hive-root.js";

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
/** File-reading tools whose only allowed route to the hive is `uh hive show`. */
export const READ_TOOLS = new Set(["read_file", "read", "view", "notebook_read", "open_file", "read_multiple_files", "get_file", "cat"]);
const DELETE_TOOLS = new Set(["delete_file", "remove"]);
/** Native tools that start another agent inside the runtime. Judged by tool name only. */
export const AGENT_TOOLS = new Set(["task", "agent", "subagent", "spawn_agent", "dispatch_agent", "delegate"]);
const DEL_VERBS = new Set(["remove-item", "ri", "rm", "rmdir", "rd", "del", "erase", "unlink", "shred"]);
const COPY_VERBS = new Set(["copy", "cp", "move", "mv", "xcopy", "robocopy", "copy-item", "move-item", "cpi", "mi", "rsync"]);
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
const LAUNCHERS = new Set(["&", ".", "npx", "bunx", "uvx", "pipx", "env", "sudo", "doas", "nohup", "nice", "timeout", "stdbuf", "builtin", "time", "exec", "call", "start", "command", "xargs", "start-process", "saps"]);
const PACKAGE_RUNNERS = new Set(["pnpm", "yarn", "npm", "bun"]);
const PACKAGE_RUNNER_VERBS = new Set(["dlx", "exec", "x"]);
const SCRIPT_HOSTS = new Set(["node", "bun", "deno", "tsx"]);
/** `uh mission` verbs only a controller may run: they start or install runs. */
const UH_CONTROLLER_MISSION_OPERATIONS = new Set(["put", "run", "run-all", "run-team"]);
/** Top-level `uh` verbs only a controller may run: they drive the fleet. */
const UH_CONTROLLER_OPERATIONS = new Set(["experiment", "kill", "ps", "report", "resume", "steer"]);

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

/** A command in executable position, the `NAME=value` assignments in front of it, and whether `xargs` adds arguments from its input. */
type ShellCommand = { argv: string[]; env: string[]; stdin: boolean };

/**
 * The commands one shell segment runs: the head after assignments and
 * launchers and, when a launcher flag may have taken the next token as its
 * value, the command after that token as well.
 */
function segmentCommands(ts: string[], env: readonly string[] = [], stdin = false): ShellCommand[] {
  const commands: ShellCommand[] = [];
  const assigned = [...env];
  let viaXargs = stdin;
  let i = 0;
  for (;;) {
    while (i < ts.length && /^\w+=/.test(ts[i])) assigned.push(ts[i++]);
    if (i >= ts.length) return commands;
    const name = executableName(ts[i]);
    if (PACKAGE_RUNNERS.has(name) && PACKAGE_RUNNER_VERBS.has((ts[i + 1] ?? "").toLowerCase())) i += 2;
    else if (LAUNCHERS.has(name)) { if (name === "xargs") viaXargs = true; i += 1; }
    else { commands.push({ argv: ts.slice(i), env: assigned, stdin: viaXargs }); return commands; }
    let afterFlag = false;
    while (i < ts.length && (ts[i].startsWith("-") || /^\w+=/.test(ts[i]))) {
      if (ts[i].startsWith("-")) afterFlag = true;
      else assigned.push(ts[i]);
      i += 1;
    }
    if (name === "timeout" && /^\d/.test(ts[i] ?? "")) i += 1;
    if (afterFlag && i + 1 < ts.length) commands.push(...segmentCommands(ts.slice(i + 1), assigned, viaXargs));
  }
}

/** The command text a nested shell (`bash -c`, `pwsh -Command`) runs, when argv is one. */
function nestedShellBody(argv: string[]): string | undefined {
  if (!argv.length || !NESTED_SHELLS.has(executableName(argv[0]))) return undefined;
  const posix = !["powershell", "pwsh", "cmd"].includes(executableName(argv[0]));
  const flag = argv.findIndex((token, index) => index > 0 && (NESTED_SHELL_FLAGS.has(token.toLowerCase()) || (posix && /^-[a-z]*c[a-z]*$/i.test(token))));
  if (flag < 0) return undefined;
  let body = argv.slice(flag + 1).join(" ").trim();
  if (body.startsWith('\\"') && body.endsWith('\\"')) body = body.slice(2, -2);
  else if (body.length >= 2 && ((body.startsWith('"') && body.endsWith('"')) || (body.startsWith("'") && body.endsWith("'")))) body = body.slice(1, -1);
  return body.replaceAll('\\"', '"').replaceAll('`"', '"') || undefined;
}

const FIND_EXEC_FLAGS = new Set(["-exec", "-execdir", "-ok", "-okdir"]);

/** The argv of each `-exec`, `-execdir`, `-ok` or `-okdir` action of a `find`. */
function findExecBodies(argv: string[]): string[][] {
  const bodies: string[][] = [];
  for (let i = 1; i < argv.length; i += 1) {
    if (!FIND_EXEC_FLAGS.has(argv[i].toLowerCase())) continue;
    const end = argv.findIndex((token, index) => index > i && [";", "\\;", "+"].includes(token));
    bodies.push(argv.slice(i + 1, end < 0 ? argv.length : end));
  }
  return bodies;
}

/** The starting points of a `find`: the operands before its first expression token, or `.`. */
function findStartPaths(argv: string[]): string[] {
  const paths: string[] = [];
  for (let i = 1; i < argv.length; i += 1) {
    const token = argv[i];
    if (/^-(?:[HLP]|O\d*)$/.test(token)) continue;
    if (token === "-D") { i += 1; continue; }
    if (token.startsWith("-") || ["(", "\\(", "!"].includes(token)) break;
    paths.push(token);
  }
  return paths.length ? paths : ["."];
}

/**
 * Every command a command line runs, at any depth: each segment's commands and
 * the bodies of command substitutions, nested `-c` shells, `eval` and
 * `find -exec`.
 */
function commandsOf(command: string, depth = 0): ShellCommand[] {
  if (depth > 4) return [];
  const found: ShellCommand[] = [];
  for (const body of substitutions(command)) found.push(...commandsOf(body, depth + 1));
  const visit = (entry: ShellCommand): void => {
    found.push(entry);
    const name = executableName(entry.argv[0]);
    const nested = nestedShellBody(entry.argv);
    if (nested !== undefined) found.push(...commandsOf(nested, depth + 1));
    else if (name === "eval") found.push(...commandsOf(entry.argv.slice(1).join(" "), depth + 1));
    else if (name === "find") for (const body of findExecBodies(entry.argv)) segmentCommands(body).forEach(visit);
  };
  for (const [segment] of splitSegments(command)) segmentCommands(tokens(segment)).forEach(visit);
  return found;
}

/** Git global options whose value is the next token. */
const GIT_VALUE_OPTIONS = new Set(["-C", "--git-dir", "--work-tree", "--namespace", "--super-prefix"]);
/** Git subcommands that only read the repository. Every other subcommand is judged a mutation. */
const GIT_READ_ONLY = new Set([
  "status", "diff", "log", "show", "blame", "annotate", "grep", "ls-files", "ls-tree", "ls-remote", "rev-parse",
  "rev-list", "describe", "cat-file", "shortlog", "whatchanged", "name-rev", "merge-base", "for-each-ref", "show-ref",
  "show-branch", "count-objects", "diff-tree", "diff-files", "diff-index", "check-ignore", "check-attr",
  "check-ref-format", "var", "help", "version", "cherry", "range-diff", "verify-commit", "verify-tag",
]);
const GIT_NETWORK = new Set(["push", "fetch", "pull", "clone", "ls-remote"]);
const BRANCH_WRITE_FLAGS = new Set(["-d", "-D", "--delete", "-m", "-M", "--move", "-c", "-C", "--copy", "-f", "--force", "-u", "--set-upstream-to", "--unset-upstream", "--edit-description", "-t", "--track", "--no-track", "--create-reflog"]);
const BRANCH_LIST_FLAGS = new Set(["-l", "--list", "-a", "--all", "-r", "--remotes", "--contains", "--no-contains", "--merged", "--no-merged", "--points-at", "--show-current"]);
const TAG_WRITE_FLAGS = new Set(["-a", "--annotate", "-s", "--sign", "-u", "--local-user", "-f", "--force", "-d", "--delete", "-m", "--message", "-F", "--file", "-e", "--edit", "--create-reflog"]);
const TAG_LIST_FLAGS = new Set(["-l", "--list", "--contains", "--no-contains", "--merged", "--no-merged", "--points-at", "-v", "--verify"]);
const CONFIG_READ_FLAGS = new Set(["--get", "--get-all", "--get-regexp", "--get-urlmatch", "--get-color", "--get-colorbool", "--list", "-l"]);
const CONFIG_WRITE_FLAGS = new Set(["--add", "--unset", "--unset-all", "--replace-all", "--rename-section", "--remove-section", "-e", "--edit"]);
/** Environment a git invocation reads a program or configuration from. */
const GIT_PROGRAM_ENV = /^(?:GIT_(?:PAGER|EXTERNAL_DIFF|SSH|SSH_COMMAND|EDITOR|SEQUENCE_EDITOR|ASKPASS|EXEC_PATH|PROXY_COMMAND|CONFIG\w*)|PAGER|EDITOR|VISUAL)=(.*)$/i;

/** The subcommand of a git argv, its arguments, and whether a global option overrides configuration. */
function gitSubcommand(argv: string[]): { name?: string; args: string[]; overridesConfig: boolean } {
  let overridesConfig = false;
  for (let i = 1; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("-")) return { name: token.toLowerCase(), args: argv.slice(i + 1), overridesConfig };
    const flag = token.split("=", 1)[0];
    if (flag === "-c" || flag === "--config-env") { overridesConfig = true; if (!token.includes("=") || flag === "-c") i += 1; continue; }
    if (flag === "--exec-path" && token.includes("=")) { overridesConfig = true; continue; }
    if (GIT_VALUE_OPTIONS.has(flag) && !token.includes("=")) i += 1;
  }
  return { args: [], overridesConfig };
}

/** Whether a subcommand outside {@link GIT_READ_ONLY} is used in a form that only reads. */
function gitReadOnlyForm(name: string, args: string[]): boolean {
  const positional = args.filter(arg => !arg.startsWith("-"));
  const flags = args.filter(arg => arg.startsWith("-")).map(arg => arg.split("=", 1)[0]);
  const first = positional[0]?.toLowerCase();
  switch (name) {
    case "branch":
      return !flags.some(flag => BRANCH_WRITE_FLAGS.has(flag)) && (!positional.length || flags.some(flag => BRANCH_LIST_FLAGS.has(flag)));
    case "tag":
      return !flags.some(flag => TAG_WRITE_FLAGS.has(flag)) && (!positional.length || flags.some(flag => TAG_LIST_FLAGS.has(flag) || /^-n\d*$/.test(flag)));
    case "remote":
      return first === undefined || first === "show" || first === "get-url";
    case "stash":
      return first === "list" || first === "show";
    case "worktree":
      return first === "list";
    case "reflog":
      return first === undefined || !["expire", "delete", "drop"].includes(first);
    case "notes":
      return first === undefined || first === "list" || first === "show";
    case "symbolic-ref":
      return positional.length <= 1 && !flags.some(flag => flag === "-d" || flag === "--delete");
    case "submodule":
      return first === undefined || first === "status" || first === "summary";
    case "config":
      return !flags.some(flag => CONFIG_WRITE_FLAGS.has(flag))
        && (first === "get" || first === "list" || positional.length === 1 || flags.some(flag => CONFIG_READ_FLAGS.has(flag)));
    default:
      return false;
  }
}

/**
 * Whether a git command may change repository state or configuration. Only
 * subcommands known to read are allowed; anything unrecognized, a global
 * configuration override, a program named through the environment, or an
 * option that writes a file or starts another program counts as a mutation.
 */
function gitMutates(entry: ShellCommand): boolean {
  if (executableName(entry.argv[0]) !== "git") return false;
  for (const assignment of entry.env) {
    const program = assignment.match(GIT_PROGRAM_ENV);
    if (program && !["", "cat", "less", "more"].includes(program[1].trim())) return true;
  }
  const { name, args, overridesConfig } = gitSubcommand(entry.argv);
  if (overridesConfig) return true;
  if (name === undefined) return false;
  if (args.some(arg => /^--(?:output|ext-diff|open-files-in-pager)(?:=|$)/.test(arg) || (name === "grep" && /^-[a-zA-Z]*O/.test(arg)))) return true;
  return !GIT_READ_ONLY.has(name) && !gitReadOnlyForm(name, args);
}

function gitContactsRemote(entry: ShellCommand): boolean {
  if (executableName(entry.argv[0]) !== "git") return false;
  const { name } = gitSubcommand(entry.argv);
  return name !== undefined && GIT_NETWORK.has(name);
}

/** Whether a command ends processes it does not own: `pkill`, `killall`, or `kill` with SIGKILL. */
function killsProcesses(entry: ShellCommand): boolean {
  const name = executableName(entry.argv[0]);
  if (name === "pkill" || name === "killall") return true;
  if (name !== "kill") return false;
  const args = entry.argv.slice(1).join(" ").toLowerCase();
  return /(?:^|\s)-(?:9|kill|sigkill)(?:\s|$)|(?:^|\s)(?:-s|-n|--signal)\s+(?:9|kill|sigkill)(?:\s|$)|--signal=(?:9|kill|sigkill)\b/.test(args);
}

const PACKAGE_INSTALL = /\b(?:pip|pip3|pipx|uv|conda|npm|pnpm|yarn|bun|gem|cargo|brew)\s+(?:install|add|i)\b|\bgo\s+(?:install|get)\b|\bapt(?:-get)?\s+install\b/i;
/** `npx --yes` fetches a package it does not find; judged after agent clients so a client launch keeps its own class. */
const PACKAGE_DOWNLOAD = /\bnpx\s+(?:-\S+\s+)*(?:-y|--yes)\b/i;

/** Flags that take inline program text, per interpreter. */
const INLINE_CODE_FLAGS = new Map<string, Set<string>>([
  ["node", new Set(["-e", "--eval", "-p", "--print"])],
  ["bun", new Set(["-e", "--eval", "-p", "--print"])],
  ["python", new Set(["-c"])],
  ["ruby", new Set(["-e"])],
  ["perl", new Set(["-e", "-E"])],
  ["php", new Set(["-r"])],
  ["osascript", new Set(["-e"])],
]);

/** The inline program texts an interpreter command line carries. */
function inlineCode(argv: string[]): string[] {
  const name = executableName(argv[0]);
  const key = /^python[\d.]*$/.test(name) ? "python" : name;
  if (key === "deno") return argv[1]?.toLowerCase() === "eval" ? [argv.slice(2).join(" ")] : [];
  const flags = INLINE_CODE_FLAGS.get(key);
  if (!flags) return [];
  const code: string[] = [];
  for (let i = 1; i + 1 < argv.length; i += 1) {
    if (flags.has(argv[i]) || (key === "perl" && /^-[a-zA-Z]*[eE]$/.test(argv[i]))) code.push(argv[i + 1]);
  }
  return code;
}

/**
 * Whether inline program text names a harness asset: the hive, the ledger, the
 * guard policy or its log, or git hooks and configuration. A best-effort check:
 * a script file or a computed path is not seen, so the controller keeps these
 * assets outside the worker's reach rather than relying on this alone.
 */
function namesHarnessAsset(code: string, workerRoot: string, hiveRoot: string): boolean {
  const text = code.replaceAll("\\", "/").toLowerCase();
  const markers = [
    ".harness/hive", ".harness/ledger", "tool-guard.json", "tool-guard.log", "uh_tool_guard_policy", "uh_tool_guard_log",
    ".git/hooks", ".git/config", "hookspath", normalized(hiveRoot, workerRoot).toLowerCase(),
    ...[process.env.UH_TOOL_GUARD_POLICY, process.env.UH_TOOL_GUARD_LOG].filter((value): value is string => Boolean(value))
      .map(value => value.replaceAll("\\", "/").toLowerCase()),
  ];
  return markers.some(marker => marker.length > 0 && text.includes(marker));
}

/** sed and perl switch clusters that select in-place editing. */
const IN_PLACE_FLAG: Record<string, RegExp> = { sed: /^-[nErsuz]*i/, perl: /^-[plnaswTtuUWX0-9]*i/ };
const WRITER_VALUE_OPTIONS = new Map<string, Set<string>>([
  ["sed", new Set(["-e", "-f", "-l", "--expression", "--file", "--line-length"])],
  ["perl", new Set(["-I", "-M", "-m", "-x"])],
  ["truncate", new Set(["-s", "-r", "--size", "--reference"])],
  ["touch", new Set(["-r", "-t", "-d", "--reference", "--date"])],
  ["ln", new Set(["-S", "-t", "--suffix", "--target-directory"])],
  ["install", new Set(["-m", "-o", "-g", "-S", "-t", "--mode", "--owner", "--group", "--suffix", "--target-directory", "--strip-program"])],
]);

/**
 * The paths a file-writing utility other than a copy or a redirection writes:
 * `sed -i`, `perl -i`, `dd of=`, `truncate`, `touch`, `ln` and `install`.
 * `undefined` when the command does not write that way.
 */
function inPlaceTargets(verb: string, argv: string[]): string[] | undefined {
  const name = verb === "gsed" ? "sed" : verb;
  if (name === "dd") {
    const outputs = argv.slice(1).filter(token => /^of=/i.test(token)).map(token => token.slice(3));
    return outputs.length ? outputs : undefined;
  }
  const valueOptions = WRITER_VALUE_OPTIONS.get(name);
  if (!valueOptions) return undefined;
  const editor = name === "sed" || name === "perl";
  let inPlace = !editor;
  let script = editor;
  let directory: string | undefined;
  let directories = false;
  const positional: string[] = [];
  for (let i = 1; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--") { positional.push(...argv.slice(i + 1).filter(Boolean)); break; }
    if (!token.startsWith("-") || token === "-") { if (token) positional.push(token); continue; }
    const flag = token.split("=", 1)[0];
    if (editor && (IN_PLACE_FLAG[name].test(token) || flag === "--in-place")) {
      inPlace = true;
      if (name === "sed" && token === "-i" && /^(?:\.|$)/.test(argv[i + 1] ?? "x")) i += 1;
    }
    if (name === "perl" && /^-[a-zA-Z]*[eE]$/.test(token)) { script = false; i += 1; continue; }
    if (!valueOptions.has(flag)) { if (name === "install" && (token === "-d" || token === "--directory")) directories = true; continue; }
    const value = token.includes("=") ? token.slice(flag.length + 1) : argv[++i];
    if (name === "sed" && ["-e", "-f", "--expression", "--file"].includes(flag)) script = false;
    if (flag === "-t" || flag === "--target-directory") directory = value;
  }
  if (!inPlace) return undefined;
  if (script) positional.shift();
  if (name === "ln") return directory !== undefined ? [directory, ...positional] : positional;
  if (directory !== undefined) return [directory];
  if (name === "install" && !directories) {
    return positional.length >= 2 ? [positional.at(-1)!] : positional.map(entry => entry.replaceAll("\\", "/").split("/").at(-1) ?? entry);
  }
  return positional;
}

/**
 * A UH invocation a worker may not run: one that starts paid runtimes (`uh
 * mission run`, `run-all`, `run-team`, `uh acceptance run`) or drives the
 * controller plane (`uh ps`, `uh report`, `uh steer`, `uh resume`, `uh kill`,
 * `uh experiment`, `uh mission put`). Read-only UH commands such as `validate`,
 * `status` and `mission check` are not controller invocations.
 */
function uhControllerInvoked(args: string[]): boolean {
  const positional = args.filter(t => !t.startsWith("-")).map(t => t.toLowerCase());
  if (positional[0] === "mission") return UH_CONTROLLER_MISSION_OPERATIONS.has(positional[1] ?? "");
  if (positional[0] === "acceptance") return positional[1] === "run";
  return UH_CONTROLLER_OPERATIONS.has(positional[0] ?? "");
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
      if (name === "uh") { if (uhControllerInvoked(ts.slice(i + 1))) return true; break; }
      if (NESTED_SHELLS.has(name)) {
        const flag = ts.findIndex((t, index) => index > i && NESTED_SHELL_FLAGS.has(t.toLowerCase()));
        if (flag >= 0 && agentClientInvoked(ts.slice(flag + 1).join(" "), clients, depth + 1)) return true;
        break;
      }
      if (SCRIPT_HOSTS.has(name)) {
        const rest = ts.slice(i + 1).filter(t => !t.startsWith("-"));
        if (rest[0]?.toLowerCase() === "run") rest.shift();
        const script = (rest[0] ?? "").replaceAll("\\", "/").toLowerCase();
        if ((script === "dist/cli.js" || script.endsWith("/dist/cli.js")) && uhControllerInvoked(rest.slice(1))) return true;
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
  const copyState = (state: DirectoryState): DirectoryState => ({ current: state.current, unknown: state.unknown, stack: [...state.stack] });
  const scan = (body: string, initial: DirectoryState, depth: number): void => {
    if (depth > 4) return;
    for (const inner of substitutions(body)) scan(inner, copyState(initial), depth + 1);
    const segments = splitSegments(body);
    let previous: [string, string] | undefined;
    for (const [segment, separator] of segments) {
      const state: DirectoryState = copyState(initial);
      applyDirectoryChange(segment, state, workerRoot, vars);
      const ts = tokens(segment);
      if (ts.length) {
        for (const target of redirectionTargets(segment)) writes.push(shellTarget(target, state, workerRoot, vars));
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
        const judge = (entry: ShellCommand): void => {
          const argv = entry.argv;
          const verb = executableName(argv[0]);
          if (COPY_VERBS.has(verb)) {
            const positional = argv.slice(1).filter(token => !isSwitch(verb, token));
            let destination = positional.at(-1);
            const destinationFlag = argv.findIndex(token => token.toLowerCase() === "-destination");
            if (destinationFlag >= 0) destination = argv[destinationFlag + 1];
            if (entry.stdin) writes.push({ value: argv[0] });
            else if (destination) writes.push(shellTarget(destination, state, workerRoot, vars));
          }
          const written = inPlaceTargets(verb, argv);
          if (written !== undefined && (entry.stdin || !written.length)) writes.push({ value: argv[0] });
          else for (const target of written ?? []) writes.push(shellTarget(target, state, workerRoot, vars));
          if (DEL_VERBS.has(verb)) {
            const args: string[] = [];
            for (let index = 1; index < argv.length; index += 1) {
              const token = argv[index], low = token.toLowerCase();
              if ((low === "-path" || low === "-literalpath") && argv[index + 1]) { args.push(...argv[++index].split(",")); continue; }
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
            if (!args.length || entry.stdin) unresolvedDelete = true;
            for (const target of args) deletes.push(shellTarget(target, state, workerRoot, vars));
          }
          if (verb === "find") {
            const actions = findExecBodies(argv).map(action => executableName(action[0] ?? ""));
            if (argv.some(token => token.toLowerCase() === "-delete") || actions.some(action => DEL_VERBS.has(action))) {
              for (const start of findStartPaths(argv)) deletes.push(shellTarget(start, state, workerRoot, vars));
            }
            if (actions.some(action => NESTED_SHELLS.has(action))) unresolvedDelete = true;
            if (actions.some(action => COPY_VERBS.has(action) || NESTED_SHELLS.has(action) || inPlaceTargets(action, [action, "-i", "x", "y"]) !== undefined)) {
              writes.push({ value: argv[0] });
            }
          }
          const nested = nestedShellBody(argv);
          if (nested) scan(nested, copyState(state), depth + 1);
          else if (verb === "eval") scan(argv.slice(1).join(" "), copyState(state), depth + 1);
        };
        segmentCommands(ts).forEach(judge);
      }
      previous = [segment, separator];
      initial.current = state.current;
      initial.unknown = state.unknown;
      initial.stack = state.stack;
    }
  };
  scan(command, { current: initialDirectory, unknown: initialDirectory === undefined, stack: [] }, 0);
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

/**
 * True when a target path is the resolved hive directory or a record inside it.
 * The hive is the main checkout's `.harness/hive` (resolved from a worktree
 * through git's common dir): a `.harness` path in a worker's own scratch
 * project is not this path and stays allowed.
 */
function hiveTarget(value: string, workerRoot: string, hiveRoot: string): boolean {
  const candidate = normalized(value, workerRoot);
  const base = normalized(hiveRoot, workerRoot);
  return candidate === base || candidate.startsWith(`${base}/`);
}

const HIVE_TAMPER_DETAIL = "The hive (.harness/hive) is controller-only; only uh land, uh queue and uh verify may write it.";
const HIVE_READ_DETAIL = "Read the hive with uh hive show.";

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

function reason(className: ToolGuardClass, policy: ToolGuardPolicy, target = "", detail = ""): ToolGuardDecision {
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
  const tail = detail.length > 0 ? ` ${detail}` : "";
  return { deny: { class: className, target: target || undefined, reason: text + tail + SUFFIX } };
}
export type ControllerGuardOptions = { allowControllerCommands?: boolean };

/**
 * Top-level `uh` operations an orchestrator may run. Observability and control
 * verbs (`ps`, `report`, `steer`, `resume`, `kill`, `experiment`) sit alongside
 * the mission, acceptance and authoring commands; a worker that runs one of the
 * controller-only verbs is denied as an `agent_client`.
 */
const CONTROLLER_OPERATIONS = new Set([
  "acceptance", "adapter", "experiment", "init", "kill", "mission", "observatory",
  "propose", "ps", "report", "resume", "sandbox", "skill", "spec", "status", "steer",
  "validate", "verify",
]);

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
  if (!operation || !CONTROLLER_OPERATIONS.has(operation)) return false;
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
  const hiveRoot = harnessHiveDir(workerRoot);
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
    if (hiveTarget(candidate, workerRoot, hiveRoot)) return reason("guard_tamper", policy, directTarget, HIVE_TAMPER_DETAIL);
    if (tamperTarget(target, workerRoot)) return reason("guard_tamper", policy, directTarget);
    const protectedPath = protectedRoot(candidate, workerRoot, protectedPaths);
    if (protectedPath) return reason("protected_root", policy, protectedPath);
    if (!target.resolved || (DELETE_TOOLS.has(lowerTool) && !inside(candidate, workerRoot, policy.write_roots))) {
      return reason(DELETE_TOOLS.has(lowerTool) ? "delete_outside" : "write_outside", policy, directTarget);
    }
    if (!DELETE_TOOLS.has(lowerTool) && !inside(candidate, workerRoot, policy.write_roots)) return reason("write_outside", policy, directTarget);
  }
  if (READ_TOOLS.has(lowerTool) && directTarget) {
    const target = shellTarget(directTarget, {
      current: explicitDirectory ? staticDirectory(explicitDirectory, workerRoot, workerRoot, new Map()) : normalized(workerRoot, workerRoot),
      unknown: false,
      stack: [],
    }, workerRoot, new Map());
    if (hiveTarget(target.resolved ?? target.value, workerRoot, hiveRoot)) {
      return reason("protected_root", policy, directTarget, HIVE_READ_DETAIL);
    }
  }
  if (AGENT_TOOLS.has(lowerTool) && policy.agent_clients.length && !policy.allow_native_subagents) return reason("agent_client", policy);
  if (!SHELL_TOOLS.has(lowerTool)) return {};
  const command = `${typeof args.command === "string" ? args.command : ""} ${Array.isArray(args.args) ? args.args.map(String).join(" ") : ""}`.trim();
  if (options.allowControllerCommands && isControllerCommand(command)) return {};
  const commands = commandsOf(command);
  if (policy.deny_git_mutations && commands.some(gitMutates)) return reason("git_mutation", policy);
  if (policy.deny_package_installs && PACKAGE_INSTALL.test(command)) return reason("package_install", policy);
  if (policy.deny_network_clients && (/\b(?:curl|wget|invoke-webrequest|iwr|invoke-restmethod|irm)\b/i.test(command) || commands.some(gitContactsRemote))) {
    return reason("network_client", policy);
  }
  if (containmentEscapeInvoked(command)) return reason("containment_escape", policy);
  if (agentClientInvoked(command, new Set(policy.agent_clients.map(client => executableName(client))))) return reason("agent_client", policy);
  if (policy.deny_package_installs && PACKAGE_DOWNLOAD.test(command)) return reason("package_install", policy);
  if (/\b(?:taskkill|stop-process|kill\s+-9)\b|\bformat\s+[a-z]:/i.test(command) || commands.some(killsProcesses)) return reason("kill_or_format", policy);
  if (commands.some(entry => inlineCode(entry.argv).some(code => namesHarnessAsset(code, workerRoot, hiveRoot)))) return reason("guard_tamper", policy);
  const vars = assignments(command);
  const initialDirectory = explicitDirectory
    ? staticDirectory(explicitDirectory, workerRoot, workerRoot, vars)
    : normalized(workerRoot, workerRoot);
  const deletes = deleteTargets(command, initialDirectory, workerRoot);
  for (const target of deletes.targets) {
    if (target.ignored) continue;
    const candidate = target.resolved ?? target.value;
    if (virtualDeviceTarget(target.value)) return reason("virtual_device", policy, target.value);
    if (hiveTarget(candidate, workerRoot, hiveRoot)) return reason("guard_tamper", policy, target.value, HIVE_TAMPER_DETAIL);
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
    if (hiveTarget(candidate, workerRoot, hiveRoot)) return reason("guard_tamper", policy, target.value, HIVE_TAMPER_DETAIL);
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
