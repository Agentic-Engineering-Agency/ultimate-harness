// Resource-wave smoke through the built CLI. No model is called: the oh-my-pi adapter is pointed at fake-omp.mjs.
// Usage: node scripts/smoke/resource-wave/run.mjs [scenario ...]   (default: all four)
// Requires: `npm run build` first, git on PATH, Windows (the memory cap requires the native Job guardian).
// Each scenario creates a throwaway git project under a temp root, runs `uh mission run-team`, and prints the
// canonical team state. UH_SMOKE_ROOT moves the root; UH_SMOKE_DEEP=1 nests it under long directory names so a
// worker run directory exceeds the classic Windows path limit (the guardian must not depend on run-dir depth).
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..", "..");
const cli = path.join(repo, "dist", "cli.js");
const fixture = path.join(here, "fake-omp.mjs").split(path.sep).join("/");

const scenarios = {
  A: { title: "budget exhausted after wave one", maxCost: 1.2, memoryMb: 512, cost: "0.5", expect: { status: "blocked", reason: /cost budget cannot reserve/ } },
  B: { title: "budget sufficient for the second wave", maxCost: 3, memoryMb: 512, cost: "0.5", expect: { status: "passed", reason: null } },
  C: { title: "unknown cost blocks paid admission", maxCost: 3, memoryMb: 512, cost: "none", expect: { status: "blocked", reason: /cost is unknown/ } },
  D: { title: "memory headroom refuses before launch", maxCost: 3, memoryMb: 999999, cost: "0.5", expect: { status: "refused", reason: /Insufficient resource headroom/ } },
};

function uh(cwd, args, env = {}) {
  return spawnSync(process.execPath, [cli, ...args], { cwd, env: { ...process.env, ...env }, encoding: "utf8" });
}

function setupProject(name, sc) {
  let base = process.env.UH_SMOKE_ROOT ?? path.join(tmpdir(), "uh-wave");
  if (process.env.UH_SMOKE_DEEP === "1") base = path.join(base, ...Array.from({ length: 2 }, (_, i) => `deep-segment-${i}-${"x".repeat(44)}`));
  const root = path.join(base, name);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: root });
  execFileSync("git", ["config", "core.autocrlf", "false"], { cwd: root });
  execFileSync("git", ["config", "user.email", "smoke@example.invalid"], { cwd: root });
  execFileSync("git", ["config", "user.name", "smoke"], { cwd: root });
  if (uh(root, ["init"]).status !== 0) throw new Error("uh init failed");
  if (uh(root, ["adapter", "add", "oh-my-pi", "--force"]).status !== 0) throw new Error("uh adapter add failed");
  const manifest = path.join(root, ".harness", "adapters", "oh-my-pi.yaml");
  writeFileSync(manifest, readFileSync(manifest, "utf8")
    .replace("cli_command: omp", `cli_command: ${fixture}`)
    .replace('default_provider: ""', "default_provider: fixture")
    .replace('default_model: ""', "default_model: fixture-model"));
  mkdirSync(path.join(root, ".harness", "missions", "wave"), { recursive: true });
  writeFileSync(path.join(root, ".harness", "missions", "wave", "mission.yaml"), `schema_version: uh.mission.v0
id: wave
title: Resource wave smoke
workflow_profile: spec-first-feature
objective: Each worker writes one answer file under out/.
shape: team
team:
  workers:
    - role: alpha
      adapter: oh-my-pi
    - role: beta
      adapter: oh-my-pi
    - role: gamma
      adapter: oh-my-pi
  leader:
    adapter: oh-my-pi
  resources:
    max_parallel: 2
    worker_memory_mb: ${sc.memoryMb}
    reserve_memory_mb: 256
    max_cost_usd: ${sc.maxCost}
    worker_cost_reservation_usd: 0.5
sandbox:
  backend: git-worktree
  promotion_policy: human-approved
verification:
  required_checks:
    - name: noop
      command: node -e "process.exit(0)"
`);
  writeFileSync(path.join(root, "README.md"), "smoke\n");
  execFileSync("git", ["add", "-A"], { cwd: root });
  execFileSync("git", ["commit", "-qm", "smoke project"], { cwd: root });
  return root;
}

function teamState(root) {
  const runs = path.join(root, ".harness", "missions", "wave", "runs");
  if (!existsSync(runs)) return null;
  for (const id of readdirSync(runs)) {
    const p = path.join(runs, id, "team-state.json");
    if (existsSync(p)) return JSON.parse(readFileSync(p, "utf8"));
  }
  return null;
}

let failures = 0;
for (const key of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(scenarios)) {
  const sc = scenarios[key];
  if (!sc) { console.log(`unknown scenario ${key}`); failures++; continue; }
  const root = setupProject(key, sc);
  const started = Date.now();
  const r = uh(root, ["mission", "run-team", "wave", "--retain"], { FIXTURE_COST: sc.cost });
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  const state = teamState(root);
  const parentPath = path.join(root, ".harness", "missions", "wave", "runtime-result.yaml");
  const parent = existsSync(parentPath) ? YAML.parse(readFileSync(parentPath, "utf8")) : null;
  let status, reason;
  if (state) { status = state.status; reason = state.admission_blocked_reason ?? null; }
  else { status = "refused"; reason = (r.stderr + r.stdout).match(/error: (.*)/)?.[1] ?? null; }
  const ok = status === sc.expect.status && (sc.expect.reason ? sc.expect.reason.test(reason ?? "") : reason === null);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${key} ${sc.title}: exit=${r.status} status=${status} reason=${JSON.stringify(reason)} elapsed=${elapsed}s`);
  if (state) console.log(`       workers=${JSON.stringify(state.workers.map((w) => [w.id, w.status]))} parent cost_usd=${parent?.cost_usd ?? "unknown"} basis=${parent?.cost_basis ?? "none"}`);
  console.log(`       project retained at ${root}`);
}
process.exit(failures ? 1 : 0);
