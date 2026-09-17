import { access, readFile } from "node:fs/promises";
import path from "node:path";

/** Invoke explicit Node entrypoints and npm-installed CLIs without passing arguments through cmd.exe. */
export async function resolveRuntimeCommand(command: string, args: string[], environment: NodeJS.ProcessEnv = process.env): Promise<{ command: string; args: string[] }> {
  if (process.platform !== "win32" || /\.(exe|com)$/i.test(command)) return { command, args };
  const searchPath = Object.entries(environment).find(([key]) => key.toLowerCase() === "path")?.[1] ?? "";
  const roots = /[\\/]/.test(command) ? [""] : searchPath.split(path.delimiter).filter(Boolean);
  for (const root of roots) {
    const base = root ? path.join(root, command) : command;
    if (/\.(mjs|cjs|js)$/i.test(base)) {
      try { await access(base); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; throw error; }
      return { command: process.execPath, args: [path.resolve(base), ...args] };
    }
    if (!/\.(cmd|bat)$/i.test(base)) {
      try { await access(`${base}.exe`); return { command: `${base}.exe`, args }; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
    const shim = /\.(cmd|bat)$/i.test(base) ? base : `${base}.cmd`;
    let source: string;
    try { source = await readFile(shim, "utf8"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; throw error; }
    const targets = [...source.matchAll(/"%dp0%[\\/]([^"\r\n]+\.(?:mjs|cjs|js))"/gi)];
    if (targets.length !== 1) throw new Error(`Cannot safely invoke non-npm shell shim ${shim}; configure the executable and argument array explicitly`);
    const directory = path.dirname(shim);
    const script = path.resolve(directory, targets[0][1]);
    const relative = path.relative(directory, script);
    if (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("Node CLI shim target escapes its installation directory");
    await access(script);
    let node = path.join(directory, "node.exe");
    try { await access(node); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      node = "node.exe";
    }
    return { command: node, args: [script, ...args] };
  }
  return { command, args };
}
