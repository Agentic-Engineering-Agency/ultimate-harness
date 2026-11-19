import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { once } from "node:events";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..", "..");
const cli = path.join(repo, "dist", "cli.js");
const ompFixture = path.join(here, "fake-omp-probe.mjs").split(path.sep).join("/");
const commandCodeFixture = path.join(here, "fake-command-code-probe.mjs").split(path.sep).join("/");
const base = path.join(tmpdir(), "uh-supervisor-loop");
const probes = ["denials_budget", "fails3", "inflight_stall", "stall", "turncap", "deadline_grace", "tamper", "tamper_absolute", "launcher_gone", "preflight_fail", "cc_denials_budget", "cc_tamper", "cmdc_shell_mutation"];

function cliRun(cwd, args, env = {}) {
  return spawnSync(process.execPath, [cli, ...args], { cwd, env: { ...process.env, ...env }, encoding: "utf8" });
}

function setup(name, probe) {
  const root = path.join(base, name);
  const commandCode = probe.startsWith("cc_") || probe === "cmdc_shell_mutation";
  const runtime = commandCode ? "command-code" : "oh-my-pi";
  const fixture = commandCode ? commandCodeFixture : ompFixture;
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: root });
  execFileSync("git", ["config", "user.email", "smoke@example.invalid"], { cwd: root });
  execFileSync("git", ["config", "user.name", "smoke"], { cwd: root });
  if (cliRun(root, ["init"]).status !== 0) throw new Error("uh init failed");
  if (cliRun(root, ["adapter", "add", runtime, "--force"]).status !== 0) throw new Error(`uh ${runtime} adapter add failed`);
  const manifestPath = path.join(root, ".harness", "adapters", `${runtime}.yaml`);
  const manifest = YAML.parse(readFileSync(manifestPath, "utf8"));
  manifest.config.cli_command = fixture;
  manifest.config.runtime_config = { ...(manifest.config.runtime_config ?? {}), model: "fixture/model", ...(commandCode ? { permission_mode: "yolo" } : {}) };
  if (!commandCode) manifest.config.default_provider = "fixture";
  writeFileSync(manifestPath, YAML.stringify(manifest));
  const missionDir = path.join(root, ".harness", "missions", name);
  mkdirSync(missionDir, { recursive: true });
  writeFileSync(path.join(missionDir, "mission.yaml"), YAML.stringify({
    schema_version: "uh.mission.v0", id: name, title: `Supervisor ${probe}`, workflow_profile: "spec-first-feature",
    objective: "Exercise the runtime supervisor.",
    ...(probe === "preflight_fail" ? { runtime_requirements: { needs_network: true } } : {}),
    ...(probe === "deadline_grace" ? { expected_outputs: { files: ["out/REPORT.md"] } } : {}),
  }));
  writeFileSync(path.join(root, "README.md"), "smoke\n");
  execFileSync("git", ["add", "-A"], { cwd: root });
  execFileSync("git", ["commit", "-qm", "smoke project"], { cwd: root });
  return { root, mission: path.join(missionDir, "mission.yaml"), runtime };
}
function overrides(probe, extra = {}) {
  const limits = { startup_timeout_ms: 1000, stall_timeout_ms: 100, timeout_ms: 5000, ...extra };
  if (probe === "denials_budget" || probe === "cc_denials_budget") limits.max_denials = 3;
  if (probe === "fails3") limits.max_repeated_failures = 3;
  if (probe === "turncap") limits.max_turns = 3;
  if (probe === "deadline_grace") limits.max_turns = 4;
  return {
    limits,
    recovery: {
      max_resumes: 2,
      notes: "Continue from the saved output.",
      ...(probe === "deadline_grace" ? { on_deadline: { grace_turns: 2 } } : {}),
    },
  };
}

function runAttempt(project, probe, runId, extra = {}) {
  const env = { FIXTURE_PROBE: probe };
  if (extra.marker) env.FIXTURE_MARKER = extra.marker;
  if (probe === "inflight_stall") env.FIXTURE_STALL_MS = "350";
  const config = { ...overrides(probe, extra.limits ?? {}), ...(extra.resume_from_run ? { resume_from_run: extra.resume_from_run } : {}) };
  return cliRun(project.root, ["mission", "run", project.mission, "--runtime", project.runtime, "--run-id", runId,
    "--runtime-config-overrides", JSON.stringify(config)], env);
}

function facts(root, missionId, runId) {
  const dir = path.join(root, ".harness", "missions", missionId, "runs", runId);
  const control = JSON.parse(readFileSync(path.join(dir, "runtime-control.json"), "utf8"));
  const result = YAML.parse(readFileSync(path.join(dir, "runtime-result.yaml"), "utf8"));
  const recoveryPath = path.join(dir, "runtime-recovery.json");
  const recovery = existsSync(recoveryPath) ? JSON.parse(readFileSync(recoveryPath, "utf8")) : undefined;
  return { control, result, recovery };
}

function latestRun(root, missionId) {
  const index = JSON.parse(readFileSync(path.join(root, ".harness", "missions", missionId, "runs", "index.json"), "utf8"));
  return index.runs.at(-1);
}

async function launcherGone(project) {
  const marker = path.join(project.root, "launcher.marker");
  const child = spawn(process.execPath, [cli, "mission", "run", project.mission, "--runtime", "oh-my-pi", "--run-id", "launcher",
    "--runtime-config-overrides", JSON.stringify(overrides("launcher_gone", { stall_timeout_ms: 2000 }))], {
    cwd: project.root, env: { ...process.env, FIXTURE_PROBE: "launcher_gone", FIXTURE_MARKER: marker }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
  for (let i = 0; i < 100 && !existsSync(marker); i++) await new Promise(resolve => setTimeout(resolve, 50));
  if (!existsSync(marker)) { child.kill("SIGKILL"); throw new Error("launcher marker was not written"); }
  child.kill("SIGKILL");
  await once(child, "close");
  for (let i = 0; i < 40; i++) {
    const control = JSON.parse(readFileSync(path.join(project.root, ".harness", "missions", "launcher_gone", "runs", "launcher", "runtime-control.json"), "utf8"));
    if (control.stop_code) break;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  const firstControl = JSON.parse(readFileSync(path.join(project.root, ".harness", "missions", "launcher_gone", "runs", "launcher", "runtime-control.json"), "utf8"));
  runAttempt(project, "launcher_gone", "resumed", { resume_from_run: "launcher" });
  const first = { control: firstControl };
  const second = facts(project.root, "launcher_gone", latestRun(project.root, "launcher_gone").run_id);
  return { ok: first.control.stop_code === "controller_lost" && second.result.status === "passed", detail: `${first.control.stop_code} -> ${second.result.status}` };
}

async function runProbe(probe) {
  const project = setup(probe, probe);
  if (probe === "preflight_fail") {
    const marker = path.join(project.root, "preflight.marker");
    const result = cliRun(project.root, ["mission", "run", project.mission, "--runtime", project.runtime, "--runtime-config-overrides", JSON.stringify({})], { FIXTURE_PROBE: probe, FIXTURE_START_MARKER: marker });
    return { ok: result.status !== 0 && /runtime preflight failed/i.test(result.stderr) && !existsSync(marker), detail: `exit=${result.status}` };
  }
  if (probe === "launcher_gone") return launcherGone(project);
  const first = runAttempt(project, probe, "initial", probe === "inflight_stall" ? { limits: { stall_timeout_ms: 100 } } : {});
  if (!existsSync(path.join(project.root, ".harness", "missions", probe, "runs", "initial", "runtime-control.json"))) throw new Error(`initial run missing (exit=${first.status}) stderr=${first.stderr} stdout=${first.stdout}`);
  const firstFacts = facts(project.root, probe, "initial");
  const latest = latestRun(project.root, probe);
  const recovery = latest.run_id !== "initial" ? facts(project.root, probe, latest.run_id) : undefined;
  let ok = false;
  if (probe === "denials_budget") ok = firstFacts.control.stop_code === "denial_budget" && /write_file out\/c\.txt/.test(firstFacts.control.stop_reason) && recovery?.result.status === "passed" && (recovery.recovery?.notes.match(/You were stopped:/g)?.length ?? 0) === 1;
  if (probe === "cc_denials_budget") ok = firstFacts.control.stop_code === "denial_budget" && /write_file out\/c\.txt/.test(firstFacts.control.stop_reason) && recovery?.result.status === "passed";
  if (probe === "fails3") ok = firstFacts.control.stop_code === "repeated_failure" && /python out\/missing_script\.py/.test(firstFacts.control.stop_reason) && recovery?.result.status === "passed";
  if (probe === "inflight_stall") ok = first.status === 0 && firstFacts.result.status === "passed" && latest.run_id === "initial";
  if (probe === "stall") ok = firstFacts.control.stop_code === "stall" && recovery?.result.status === "passed";
  if (probe === "turncap") ok = first.status !== 0 && firstFacts.control.stop_code === "turn_limit" && latest.run_id === "initial";
  if (probe === "deadline_grace") {
    const reportPath = path.join(project.root, "out", "REPORT.md");
    const report = existsSync(reportPath) ? readFileSync(reportPath, "utf8") : "";
    ok = firstFacts.control.stop_code === "deadline" &&
      /remaining for grace/.test(firstFacts.control.stop_reason ?? "") &&
      latest.run_id !== "initial" &&
      recovery?.result.status === "passed" &&
      recovery.result.completion === "incomplete" &&
      typeof recovery.result.incomplete_reason === "string" &&
      recovery.recovery?.grace === true &&
      report.startsWith("INCOMPLETE") &&
      /Missing for the next step/.test(report);
  }
  if (probe === "tamper" || probe === "tamper_absolute" || probe === "cc_tamper" || probe === "cmdc_shell_mutation") ok = first.status !== 0 && firstFacts.control.stop_code === "policy" && /\.harness[\\/]/.test(firstFacts.control.stop_reason) && latest.run_id === "initial";
  return { ok, detail: `exit=${first.status}, stop=${firstFacts.control.stop_code ?? "none"}, runs=${latest.run_id}${recovery ? `, recovery=${recovery.result.status}` : ""}` };
}

let failures = 0;
for (const probe of process.argv.slice(2).length ? process.argv.slice(2) : probes) {
  try {
    const result = await runProbe(probe);
    console.log(`${result.ok ? "PASS" : "FAIL"} ${probe}: ${result.detail}`);
    if (!result.ok) failures++;
  } catch (error) {
    console.log(`FAIL ${probe}: ${(error instanceof Error ? error.message : error)}`);
    failures++;
  }
}
process.exit(failures ? 1 : 0);
