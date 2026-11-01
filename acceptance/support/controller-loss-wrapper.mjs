import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";

const [controlPath, executable, ...args] = process.argv.slice(2);
if (!controlPath || !executable) throw new Error("usage: controller-loss-wrapper.mjs <control-path> <executable> [args...]");
const child = spawn(executable, args, { stdio: "inherit", shell: false });
let killed = false;
const poll = setInterval(() => {
  try {
    const control = JSON.parse(readFileSync(controlPath, "utf8"));
    if (!killed && control.status === "running" && Number(control.turns) >= 1) {
      killed = true;
      clearInterval(poll);
      child.kill();
    }
  } catch {
    // The controller may not have published its first control record yet.
  }
}, 100);
child.on("close", (code, signal) => {
  clearInterval(poll);
  if (killed) process.exit(0);
  if (signal) process.exit(1);
  process.exit(code ?? 1);
});
