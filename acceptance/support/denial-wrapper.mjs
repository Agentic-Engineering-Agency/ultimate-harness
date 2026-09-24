import { accessSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

function resolveExecutable(command) {
  if (path.isAbsolute(command) || command.includes(path.sep)) return command;
  const pathValue = process.env.PATH ?? "";
  const extensions = process.platform === "win32"
    ? (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)
    : [""];
  for (const root of pathValue.split(path.delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = path.join(root, `${command}${extension}`);
      try {
        accessSync(candidate);
        return candidate;
      } catch {
        // Continue searching PATH entries and PATHEXT extensions.
      }
    }
  }
  return command;
}

const extension = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "denial-extension.mjs");
const args = ["--extension", extension, ...process.argv.slice(2)];
const result = spawnSync(resolveExecutable("omp"), args, { stdio: "inherit", shell: false });
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
