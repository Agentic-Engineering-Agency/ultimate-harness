import { accessSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function resolveExecutable(command) {
  if (path.isAbsolute(command) || command.includes(path.sep)) return command;
  const extensions = process.platform === "win32"
    ? (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)
    : [""];
  for (const root of (process.env.PATH ?? "").split(path.delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = path.join(root, `${command}${extension}`);
      try { accessSync(candidate); return candidate; } catch { /* continue */ }
    }
  }
  return command;
}
const result = spawnSync(resolveExecutable("cmdc"), process.argv.slice(2), { encoding: "utf8", shell: false });
const stdout = result.stdout ?? "";
function stripUsage(value) {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(stripUsage);
  const stripped = {};
  for (const [key, child] of Object.entries(value)) {
    if (key !== "usage") stripped[key] = stripUsage(child);
  }
  return stripped;
}
for (const line of stdout.split(/(\r?\n)/)) {
  if (line === "\n" || line === "\r\n") { process.stdout.write(line); continue; }
  try { process.stdout.write(`${JSON.stringify(stripUsage(JSON.parse(line)))}\n`); }
  catch { process.stdout.write(line); }
}
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) { console.error(result.error.message); process.exit(1); }
process.exit(result.status ?? 1);
