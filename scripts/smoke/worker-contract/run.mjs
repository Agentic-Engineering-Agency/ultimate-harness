// Worker-contract smoke through the built CLI. The fake OMP receives per-worker routes and writes alpha's output only.
// Usage: node scripts/smoke/worker-contract/run.mjs
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..", "..");
const cli = path.join(repo, "dist", "cli.js");
const fixture = path.resolve(repo, "scripts", "smoke", "resource-wave", "fake-omp.mjs").split(path.sep).join("/");
const root = path.join(tmpdir(), "uh-worker-contract");
rmSync(root, { recursive: true, force: true });
mkdirSync(root, { recursive: true });
execFileSync("git", ["init", "-q", "-b", "main"], { cwd: root });
execFileSync("git", ["config", "user.email", "smoke@example.invalid"], { cwd: root });
execFileSync("git", ["config", "user.name", "smoke"], { cwd: root });
if (spawnSync(process.execPath, [cli, "init"], { cwd: root, encoding: "utf8" }).status !== 0) throw new Error("uh init failed");
if (spawnSync(process.execPath, [cli, "adapter", "add", "oh-my-pi", "--force"], { cwd: root, encoding: "utf8" }).status !== 0) throw new Error("uh adapter add failed");
const manifest = path.join(root, ".harness", "adapters", "oh-my-pi.yaml");
writeFileSync(manifest, readFileSync(manifest, "utf8")
  .replace("cli_command: omp", `cli_command: ${fixture}`)
  .replace('default_provider: ""', "default_provider: fixture")
  .replace('default_model: ""', "default_model: fixture-model"));
mkdirSync(path.join(root, ".harness", "missions", "contract"), { recursive: true });
writeFileSync(path.join(root, ".harness", "missions", "contract", "mission.yaml"), `schema_version: uh.mission.v0
id: contract
title: Worker contract smoke
workflow_profile: spec-first-feature
objective: Complete the team objective
shape: team
team:
  workers:
    - role: alpha
      adapter: oh-my-pi
      objective: Produce alpha's answer
      runtime_config_overrides:
        model: fixture/model-a
      limits:
        max_turns: 3
      expected_outputs:
        files:
          - out/answer-alpha.txt
    - role: beta
      adapter: oh-my-pi
      runtime_config_overrides:
        model: fixture/model-b
      limits:
        max_turns: 7
      expected_outputs:
        files:
          - out/report.md
  leader:
    adapter: oh-my-pi
verification:
  required_checks:
    - name: noop
      command: node -e "process.exit(0)"
`);
writeFileSync(path.join(root, "README.md"), "smoke\n");
execFileSync("git", ["add", "-A"], { cwd: root });
execFileSync("git", ["commit", "-qm", "smoke project"], { cwd: root });
const result = spawnSync(process.execPath, [cli, "mission", "run-team", "contract", "--retain"], { cwd: root, encoding: "utf8" });
const runsDir = path.join(root, ".harness", "missions", "contract", "runs");
let state = null;
if (existsSync(runsDir)) {
  const id = readdirSync(runsDir).find((entry) => existsSync(path.join(runsDir, entry, "team-state.json")));
  if (id) state = JSON.parse(readFileSync(path.join(runsDir, id, "team-state.json"), "utf8"));
}
const worker = (id) => state?.workers.find((item) => item.id === id);
const runtimeResult = (item) => item?.runtime_result_path ? YAML.parse(readFileSync(path.join(root, item.runtime_result_path), "utf8")) : null;
const alpha = worker("alpha");
const beta = worker("beta");
const checks = [
  state?.status === "passed_partial",
  alpha?.status === "succeeded" && alpha.outputs?.[0]?.status === "passed",
  beta?.status === "blocked" && /out\/report\.md/.test(beta.blocked_reason ?? ""),
  alpha?.contract?.limits?.max_turns === 3 && beta?.contract?.limits?.max_turns === 7,
  runtimeResult(alpha)?.model === "model-a" && runtimeResult(beta)?.model === "model-b",
];
const ok = result.status === 0 && checks.every(Boolean);
console.log(`${ok ? "PASS" : "FAIL"} worker contract: exit=${result.status} status=${state?.status ?? "missing"}`);
console.log(`       workers=${JSON.stringify(state?.workers?.map((item) => [item.id, item.status, item.blocked_reason ?? null]) ?? [])}`);
console.log(`       models=${JSON.stringify([runtimeResult(alpha)?.model, runtimeResult(beta)?.model])}`);
console.log(`       project retained at ${root}`);
if (!ok) {
  console.error(result.stdout);
  console.error(result.stderr);
  process.exit(1);
}
