import { test, expect, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile, chmod, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { parse, stringify } from "yaml";
import { initializeHarness } from "../src/harness/init.js";
import { addAdapter } from "../src/harness/adapter-add.js";
import { proposeMission } from "../src/harness/propose.js";
import { prepareIndependentReview, collectIndependentReview, validateIndependentReviewReport } from "../src/harness/independent-review.js";
import { IndependentReviewAssessmentSchema, IndependentReviewRequestSchema, IndependentReviewReportSchema } from "../src/schema/independent-review.js";
import { createSandbox } from "../src/harness/sandbox.js";
import { runCommandCode, planCommandCodeRun } from "../src/adapters/command-code.js";
import { verifyMission } from "../src/harness/verify.js";

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "uh-independent-review-"));
  await initializeHarness(root);
  await addAdapter(root, "command-code");
  await writeFile(path.join(root, "answer.txt"), "42");
  await proposeMission(root, { id: "source", title: "Answer", objective: "Produce answer 42", workflow: "research-docs",
    expectedOutputs: ["answer.txt"], completionCriteria: ["Answer equals 42"] });
  return root;
}

// The guard hook is published into a content-addressed cache from the build
// output. Point both at a temporary fixture so the suite neither needs a real
// build nor writes to the per-user cache.
let snapshotRoot: string;
let previousDist: string | undefined;
let previousCache: string | undefined;

beforeEach(async () => {
  snapshotRoot = await mkdtemp(path.join(tmpdir(), "uh-independent-review-snapshot-"));
  const hook = path.join(snapshotRoot, "dist", "extensions", "tool-guard", "cmdc-hook.js");
  await mkdir(path.dirname(hook), { recursive: true });
  await writeFile(hook, "export default function () {}\n");
  previousDist = process.env.UH_HARNESS_DIST;
  previousCache = process.env.UH_RUNTIME_SNAPSHOT_CACHE;
  process.env.UH_HARNESS_DIST = path.join(snapshotRoot, "dist");
  process.env.UH_RUNTIME_SNAPSHOT_CACHE = path.join(snapshotRoot, "cache");
});

afterEach(async () => {
  if (previousDist === undefined) delete process.env.UH_HARNESS_DIST; else process.env.UH_HARNESS_DIST = previousDist;
  if (previousCache === undefined) delete process.env.UH_RUNTIME_SNAPSHOT_CACHE; else process.env.UH_RUNTIME_SNAPSHOT_CACHE = previousCache;
  await rm(snapshotRoot, { recursive: true, force: true });
});

// The adapter spawns `cli_command` directly, so the fixture must be a real
// executable on POSIX: shebang plus the exec bit set below.
const reviewerFixture = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const requestBase = '.harness/missions/review/';
const reportPath = 'out/review-report.json';
// The prompt now arrives on stdin; argv only carries the flags.
let prompt = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { prompt += chunk; });
process.stdin.on('end', () => {
const request = JSON.parse(fs.readFileSync(requestBase + 'review-request.json', 'utf8'));
const report = {schema_version:'uh.independent-review-report.v0', request_sha256: prompt.match(/request_sha256 ([a-f0-9]{64})/)[1],
 sources:request.sources.map(source => {
  const output = source.files.find(file => file.kind === 'output');
  const observed = fs.readFileSync(output.snapshot_path, 'utf8');
  const passed = observed === '42';
  return {mission_id:source.mission_id, claims_checked:[{claim:'Answer equals 42',source:output.snapshot_path,observed,verdict:passed?'supported':'contradicted'}],
   acceptance:source.acceptance.map(item=>({id:item.id,status:passed?'passed':'failed',evidence:observed})),
   checks:source.checks.map(item=>({id:item.id,status:passed?'passed':'failed',evidence:observed})),
   findings:passed?[]:[{severity:'error',detail:'Observed answer differs from the required 42',evidence:observed}],
   observations:[{title:'Captured output inspected in full',evidence:observed,relates_to:(source.acceptance[0]||source.checks[0]||{}).id,severity:'info'},
    {title:'No claims outside the listed ids were verified',evidence:'Review covered only the listed ids',severity:'warn'}],
   verdict:passed?'pass':'needs-remediation',reason:'Compared captured answer to 42'};
 })};
fs.mkdirSync(path.dirname(reportPath), {recursive:true});
fs.writeFileSync(reportPath, JSON.stringify(report));
console.log(JSON.stringify({type:'event',event:{type:'model_request_start',model:'offline-review-fixture'}}));
console.log(JSON.stringify({type:'result',subtype:'success',finalText:'Review complete',stopReason:'end_turn'}));
});
`;

async function executeFixture(root: string) {
  const executable = path.join(root, "reviewer.cjs");
  await writeFile(executable, reviewerFixture);
  await chmod(executable, 0o755);
  const adapterPath = path.join(root, ".harness", "adapters", "command-code.yaml");
  const adapter = parse(await readFile(adapterPath, "utf8"));
  adapter.config.cli_command = executable;
  adapter.config.runtime_config = { ...(adapter.config.runtime_config ?? {}), permission_mode: "yolo" };
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  execFileSync("git", ["add", "--force", "."], { cwd: root });
  execFileSync("git", ["-c", "user.name=UH Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "fixture"], { cwd: root });
  await prepareIndependentReview(root, { id: "review", sources: [{ missionId: "source" }], runtime: "command-code", model: "offline-review-fixture" });
  const reviewMissionPath = path.join(root, ".harness", "missions", "review", "mission.yaml");
  const reviewMission = parse(await readFile(reviewMissionPath, "utf8")) as Record<string, unknown>;
  expect(reviewMission.guard).toEqual({ write_roots: ["out"], deny_git_mutations: true, deny_package_installs: true, deny_network_clients: true });
  const workspace = await createSandbox(root, { id: "review-workspace", missionId: "review", backend: "directory" });
  workspace.path = path.resolve(root, workspace.path);
  const workspaceAdapterPath = path.join(workspace.path, ".harness", "adapters", "command-code.yaml");
  const workspaceAdapter = parse(await readFile(workspaceAdapterPath, "utf8")) as Record<string, unknown>;
  const workspaceConfig = workspaceAdapter.config as Record<string, unknown>;
  workspaceConfig.cli_command = executable;
  workspaceConfig.runtime_config = { ...(workspaceConfig.runtime_config as Record<string, unknown> | undefined), permission_mode: "yolo" };
  await writeFile(workspaceAdapterPath, stringify(workspaceAdapter));
  const missionPath = path.join(workspace.path, ".harness", "missions", "review", "mission.yaml");
  const run = await runCommandCode(workspace.path, missionPath, { artifactRoot: root });
  expect(reviewMission.expected_outputs).toEqual({ files: ["out/review-report.json"] });
  expect(run.result.status).toBe("passed");
  return { workspace, missionPath };
}

test("a separate native review produces an advisory assessment, never owner approval", async () => {
  const root = await fixture();
  try {
    const { workspace, missionPath } = await executeFixture(root);
    const assessment = await collectIndependentReview(root, "review");
    expect(assessment).toMatchObject({ recommendation: "pass", human_acceptance_required: true });
    expect(assessment.observations).toEqual([
      { source: "source", title: "Captured output inspected in full", evidence: "42", relates_to: "ac-1", severity: "info" },
      { source: "source", title: "No claims outside the listed ids were verified", evidence: "Review covered only the listed ids", severity: "warn" },
    ]);
    expect((await verifyMission(root, "review")).status).toBe("passed");
    expect(await readFile(path.join(root, "answer.txt"), "utf8")).toBe("42");
    await expect(readFile(path.join(root, ".harness", "missions", "source", "promotion.yaml"))).rejects.toThrow();
    await expect(planCommandCodeRun(root, path.join(root, ".harness", "missions", "review", "mission.yaml"))).rejects.toThrow();
    await expect(planCommandCodeRun(workspace.path, missionPath, { artifactRoot: root, extraRuntimeConfigOverrides: { resume_session: "worker-session" } })).rejects.toThrow();
    await expect(planCommandCodeRun(workspace.path, missionPath, { artifactRoot: root, extraRuntimeConfigOverrides: { model: "another-model" } })).rejects.toThrow();
  } finally { await rm(root, { recursive: true, force: true }); }
}, 30_000);

test("an assessment without the new evidence fields still parses", () => {
  const legacy = { schema_version: "uh.independent-review-assessment.v0", review_id: "review",
    run_id: "20260922T000000Z-000000", request_sha256: "a".repeat(64), recommendation: "pass", human_acceptance_required: true };
  expect(IndependentReviewAssessmentSchema.parse(legacy)).toEqual(legacy);
});

test("the collected assessment keeps contradicted claims and warning/error findings", async () => {
  const root = await fixture();
  try {
    await writeFile(path.join(root, "answer.txt"), "0");
    await executeFixture(root);
    const assessment = await collectIndependentReview(root, "review");
    expect(assessment.recommendation).toBe("needs-remediation");
    expect(assessment.claims).toEqual([
      { source: "source", claim: "Answer equals 42", verdict: "contradicted", evidence_source: expect.any(String) },
    ]);
    expect(assessment.findings).toEqual([
      { source: "source", severity: "error", detail: "Observed answer differs from the required 42", evidence: "0" },
    ]);
  } finally { await rm(root, { recursive: true, force: true }); }
}, 30_000);

test("review-prepare captures the worker's real diff, deletions, worker evidence, and skips protected paths", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "uh-independent-review-changed-"));
  const worktreeParent = await mkdtemp(path.join(tmpdir(), "uh-independent-review-worktree-"));
  const worktree = path.join(worktreeParent, "wt");
  const git = (args: string[], cwd = root) =>
    execFileSync("git", ["-c", "user.name=UH Fixture", "-c", "user.email=fixture@example.invalid", ...args], { cwd });
  try {
    await initializeHarness(root);
    await addAdapter(root, "command-code");
    await writeFile(path.join(root, "answer.txt"), "42");
    await writeFile(path.join(root, "companion.txt"), "before");
    await writeFile(path.join(root, "obsolete.txt"), "old");
    await proposeMission(root, { id: "source", title: "Answer", objective: "Produce answer 42", workflow: "research-docs",
      expectedOutputs: ["answer.txt"], completionCriteria: ["Answer equals 42"] });
    git(["init", "--quiet"]);
    git(["add", "--force", "."]);
    git(["commit", "--quiet", "-m", "base"]);
    const base = git(["rev-parse", "HEAD"]).toString().trim();
    git(["worktree", "add", "--quiet", "-b", "worker", worktree, base]);
    await writeFile(path.join(worktree, "companion.txt"), "after");
    await writeFile(path.join(worktree, "added.ts"), "export const added = true;\n");
    await rm(path.join(worktree, "obsolete.txt"));
    await writeFile(path.join(worktree, ".harness", "note.txt"), "protected change\n");
    await mkdir(path.join(worktree, ".harness", "missions", "source"), { recursive: true });
    await writeFile(path.join(worktree, ".harness", "missions", "source", "verification.yaml"),
      stringify({ schema_version: "uh.verification-result.v0", mission_id: "source", status: "passed",
        checks: [{ name: "answer-exists", type: "command", status: "passed" }] }));
    git(["add", "--force", "."], worktree);
    git(["commit", "--quiet", "-m", "worker"], worktree);
    git(["config", "branch.worker.base", base]);
    const prepared = await prepareIndependentReview(root, { id: "review",
      sources: [{ missionId: "source", workspaceRoot: worktree }], runtime: "command-code", model: "offline-review-fixture" });
    expect(prepared.reportPath).toBe("out/review-report.json");
    const request = IndependentReviewRequestSchema.parse(JSON.parse(await readFile(prepared.requestPath, "utf8")));
    const changed = new Map(request.sources[0].files.filter(file => file.kind === "changed").map(file => [file.original_path, file]));
    expect([...changed.keys()].sort()).toEqual(["added.ts", "companion.txt", "obsolete.txt"]);
    expect(changed.get("companion.txt")).toMatchObject({ state: "present" });
    expect(changed.get("companion.txt")!.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(changed.get("added.ts")!.state).toBe("present");
    expect(changed.get("obsolete.txt")).toEqual({ kind: "changed", original_path: "obsolete.txt", state: "absent" });
    expect(await readFile(path.join(root, changed.get("companion.txt")!.snapshot_path!), "utf8")).toBe("after");
    expect(request.sources[0].files.some(file => file.kind === "output" && file.original_path === "answer.txt" && file.state === "present")).toBe(true);
    // `.harness` stays out of the changed-file walk, and the worker's own
    // verification result is still carried because it is captured by name.
    expect(request.sources[0].files.filter(file => file.kind === "changed")
      .every(file => !file.original_path.startsWith(".harness/"))).toBe(true);
    const verification = request.sources[0].files.find(file => file.kind === "verification")!;
    expect(verification).toMatchObject({ state: "present", status: "passed",
      original_path: ".harness/missions/source/verification.yaml" });
    expect(await readFile(path.join(root, verification.snapshot_path!), "utf8"))
      .toBe(await readFile(path.join(worktree, ".harness", "missions", "source", "verification.yaml"), "utf8"));
    expect(verification.sha256).toBe(createHash("sha256").update(await readFile(path.join(worktree, ".harness", "missions", "source", "verification.yaml"))).digest("hex"));
    // The worker never ran in this worktree, so its final message is absent with a reason.
    expect(request.sources[0].files.find(file => file.kind === "report")).toEqual({
      kind: "report", state: "absent", original_path: ".harness/missions/source/latest.json",
      reason: "the source workspace has no latest.json run pointer, so no run's final message can be located",
    });
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(worktreeParent, { recursive: true, force: true });
  }
});

/** Write the two artifacts a worker's own run leaves behind in its workspace. */
async function writeWorkerEvidence(root: string, verification: unknown, finalMessage: string, runId = "20260922T000000Z-aaaaaa") {
  const missionDir = path.join(root, ".harness", "missions", "source");
  await mkdir(path.join(missionDir, "runs", runId), { recursive: true });
  await writeFile(path.join(missionDir, "verification.yaml"), typeof verification === "string" ? verification : stringify(verification));
  await writeFile(path.join(missionDir, "runs", runId, "runtime-final.txt"), finalMessage);
  await writeFile(path.join(missionDir, "latest.json"), JSON.stringify({
    schema_version: "uh.latest-run.v0", run_id: runId, started_at: "2026-09-22T00:00:00.000Z", status: "passed",
  }));
}

const workerResult = { schema_version: "uh.verification-result.v0", mission_id: "source", status: "failed",
  checks: [{ name: "typecheck", type: "command", status: "failed", notes: "2 errors" }] };

test("a review packet carries the worker's verification status and final message", async () => {
  const root = await fixture();
  try {
    const empty = await prepareIndependentReview(root, { id: "review-empty", sources: [{ missionId: "source" }],
      runtime: "command-code", model: "offline-review-fixture" });
    const emptyRequest = IndependentReviewRequestSchema.parse(JSON.parse(await readFile(empty.requestPath, "utf8")));
    expect(emptyRequest.sources[0].files.filter(file => file.kind === "verification" || file.kind === "report")).toEqual([
      { kind: "verification", state: "absent", original_path: ".harness/missions/source/verification.yaml",
        reason: "the source workspace has no verification.yaml, so uh verify has never run there" },
      { kind: "report", state: "absent", original_path: ".harness/missions/source/latest.json",
        reason: "the source workspace has no latest.json run pointer, so no run's final message can be located" },
    ]);
    expect(String((parse(await readFile(path.join(root, ".harness", "missions", "review-empty", "mission.yaml"), "utf8")) as Record<string, unknown>).objective))
      .toContain("- source: verification absent (the source workspace has no verification.yaml, so uh verify has never run there);"
        + " final message absent (the source workspace has no latest.json run pointer, so no run's final message can be located).");

    await writeWorkerEvidence(root, workerResult, "I wrote the answer and ran nothing.\n");
    const prepared = await prepareIndependentReview(root, { id: "review", sources: [{ missionId: "source" }],
      runtime: "command-code", model: "offline-review-fixture" });
    const request = IndependentReviewRequestSchema.parse(JSON.parse(await readFile(prepared.requestPath, "utf8")));
    const verification = request.sources[0].files.find(file => file.kind === "verification")!;
    const report = request.sources[0].files.find(file => file.kind === "report")!;
    const original = path.join(root, ".harness", "missions", "source", "verification.yaml");
    expect(verification).toMatchObject({ kind: "verification", state: "present", status: "failed",
      original_path: ".harness/missions/source/verification.yaml" });
    expect(verification.sha256).toBe(createHash("sha256").update(await readFile(original)).digest("hex"));
    expect(await readFile(path.join(root, verification.snapshot_path!), "utf8")).toBe(await readFile(original, "utf8"));
    expect(report).toMatchObject({ kind: "report", state: "present",
      original_path: ".harness/missions/source/runs/20260922T000000Z-aaaaaa/runtime-final.txt" });
    expect(report.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(await readFile(path.join(root, report.snapshot_path!), "utf8")).toBe("I wrote the answer and ran nothing.\n");
    const mission = parse(await readFile(path.join(root, ".harness", "missions", "review", "mission.yaml"), "utf8")) as Record<string, unknown>;
    const readFirst = ((mission.context as Record<string, unknown>).read_first ?? []) as string[];
    expect(readFirst).toContain(verification.snapshot_path);
    expect(readFirst).toContain(report.snapshot_path);
    expect(String(mission.objective)).toContain(`- source: verification ${verification.snapshot_path} with status failed;`
      + ` final message ${report.snapshot_path}.`);
    expect(String(mission.objective)).toContain("the worker's own final message is a claim to compare against that evidence");

    await writeWorkerEvidence(root, "status: [not, a, verification, document\n", "unreadable\n", "20260922T000001Z-bbbbbb");
    const corrupt = await prepareIndependentReview(root, { id: "review-corrupt", sources: [{ missionId: "source" }],
      runtime: "command-code", model: "offline-review-fixture" });
    const corruptRequest = IndependentReviewRequestSchema.parse(JSON.parse(await readFile(corrupt.requestPath, "utf8")));
    const corruptVerification = corruptRequest.sources[0].files.find(file => file.kind === "verification")!;
    expect(corruptVerification).toMatchObject({ state: "present", status: "blocked",
      reason: "the captured verification.yaml does not parse as a uh.verification-result.v0 document" });
    expect(corruptVerification.sha256).toMatch(/^[a-f0-9]{64}$/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("worker evidence is integrity-checked and a worker run without a final message is reported absent", async () => {
  const root = await fixture();
  try {
    await writeWorkerEvidence(root, { ...workerResult, status: "passed",
      checks: [{ name: "answer-exists", type: "command", status: "passed" }] }, "Answer is 42; both checks ran.\n");
    const prepared = await prepareIndependentReview(root, { id: "review-nomessage", sources: [{ missionId: "source" }],
      runtime: "command-code", model: "offline-review-fixture" });
    await rm(path.join(root, ".harness", "missions", "source", "runs", "20260922T000000Z-aaaaaa", "runtime-final.txt"));
    const absent = await prepareIndependentReview(root, { id: "review-missing", sources: [{ missionId: "source" }],
      runtime: "command-code", model: "offline-review-fixture" });
    const absentRequest = IndependentReviewRequestSchema.parse(JSON.parse(await readFile(absent.requestPath, "utf8")));
    expect(absentRequest.sources[0].files.find(file => file.kind === "verification")).toMatchObject({ state: "present", status: "passed" });
    expect(absentRequest.sources[0].files.find(file => file.kind === "report")).toEqual({
      kind: "report", state: "absent", original_path: ".harness/missions/source/runs/20260922T000000Z-aaaaaa/runtime-final.txt",
      reason: "the latest run 20260922T000000Z-aaaaaa wrote no runtime-final.txt",
    });
    expect(prepared.requestSha256).not.toBe(absent.requestSha256);
  } finally { await rm(root, { recursive: true, force: true }); }
});

/**
 * Lay out a team run on disk: a worker worktree that holds no run records, plus
 * the team's run pointer, `team-state.json`, and the worker artifact root (which
 * does hold the worker's own `latest.json` and `runs/<run-id>/runtime-final.txt`).
 */
async function teamRunFixture(root: string, teamId: string, workerId: string, options: { includeWorker?: boolean } = {}) {
  const teamRunId = "20260922T000000Z-team01";
  const workerRunId = "20260922T000000Z-aaaaaa";
  const teamMissionDir = path.join(root, ".harness", "missions", teamId);
  const teamRoot = path.join(teamMissionDir, "team");
  const workerWorktree = path.join(teamRoot, "workers", workerId);
  const artifactScope = `artifacts/${teamRunId}/workers/${workerId}`;
  const artifactMissionDir = path.join(teamRoot, artifactScope, ".harness", "missions", "source");
  const artifactFinal = path.join(artifactMissionDir, "runs", workerRunId, "runtime-final.txt");
  const finalMessage = "Team worker final message.\n";
  await mkdir(workerWorktree, { recursive: true });
  await mkdir(path.join(teamMissionDir, "runs", teamRunId), { recursive: true });
  await writeFile(path.join(teamMissionDir, "latest.json"), JSON.stringify({
    schema_version: "uh.latest-run.v0", run_id: teamRunId, started_at: "2026-09-22T00:00:00.000Z", status: "passed" }));
  await writeFile(path.join(teamMissionDir, "runs", teamRunId, "team-state.json"), JSON.stringify({
    schema_version: "uh.team-run.v0", mission_id: teamId, run_id: teamRunId, status: "passed",
    started_at: "2026-09-22T00:00:00.000Z", finished_at: "2026-09-22T00:01:00.000Z",
    integration_report_path: "team/integration-report.md", verification_status: null,
    leader: { role: "integrator", adapter: "command-code", status: "succeeded" },
    workers: options.includeWorker === false ? [] : [{
      id: workerId, role: workerId, adapter: "command-code", run_id: workerRunId,
      artifact_scope: artifactScope, runtime_result_path: null, status: "succeeded",
      started_at: "2026-09-22T00:00:00.000Z", finished_at: "2026-09-22T00:01:00.000Z",
    }],
  }, null, 2));
  await mkdir(path.join(artifactMissionDir, "runs", workerRunId), { recursive: true });
  await writeFile(artifactFinal, finalMessage);
  await writeFile(path.join(artifactMissionDir, "latest.json"), JSON.stringify({
    schema_version: "uh.latest-run.v0", run_id: workerRunId, started_at: "2026-09-22T00:00:00.000Z", status: "passed" }));
  return { workerWorktree, artifactFinal, finalMessage };
}

test("a team worker's final message is captured from the team's artifact root", async () => {
  const root = await fixture();
  try {
    const { workerWorktree, artifactFinal, finalMessage } = await teamRunFixture(root, "wave-team", "worker-a");
    const prepared = await prepareIndependentReview(root, { id: "review-team",
      sources: [{ missionId: "source", workspaceRoot: workerWorktree }], runtime: "command-code", model: "offline-review-fixture" });
    const request = IndependentReviewRequestSchema.parse(JSON.parse(await readFile(prepared.requestPath, "utf8")));
    const report = request.sources[0].files.find(file => file.kind === "report")!;
    expect(report).toMatchObject({ kind: "report", state: "present",
      original_path: path.relative(await realpath(root), await realpath(artifactFinal)).split(path.sep).join("/") });
    expect(report.sha256).toBe(createHash("sha256").update(await readFile(artifactFinal)).digest("hex"));
    expect(await readFile(path.join(root, report.snapshot_path!), "utf8")).toBe(finalMessage);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("a team whose state names no worker keeps the absent record with the lookup that failed", async () => {
  const root = await fixture();
  try {
    const { workerWorktree } = await teamRunFixture(root, "wave-team", "worker-a", { includeWorker: false });
    const prepared = await prepareIndependentReview(root, { id: "review-team",
      sources: [{ missionId: "source", workspaceRoot: workerWorktree }], runtime: "command-code", model: "offline-review-fixture" });
    const request = IndependentReviewRequestSchema.parse(JSON.parse(await readFile(prepared.requestPath, "utf8")));
    expect(request.sources[0].files.find(file => file.kind === "report")).toEqual({
      kind: "report", state: "absent", original_path: ".harness/missions/source/latest.json",
      reason: "the team state names no worker worker-a, so the worker artifact root cannot be located",
    });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("the review round trip carries worker evidence and a tampered capture fails collection", async () => {
  const root = await fixture();
  try {
    await writeWorkerEvidence(root, { ...workerResult, status: "passed",
      checks: [{ name: "answer-exists", type: "command", status: "passed" }] }, "Answer is 42; both checks ran.\n");
    const { workspace } = await executeFixture(root);
    const assessment = await collectIndependentReview(root, "review");
    expect(assessment.recommendation).toBe("pass");
    const request = IndependentReviewRequestSchema.parse(JSON.parse(
      await readFile(path.join(root, ".harness", "missions", "review", "review-request.json"), "utf8")));
    const verification = request.sources[0].files.find(file => file.kind === "verification")!;
    expect(verification).toMatchObject({ state: "present", status: "passed" });
    await writeFile(path.join(workspace.path, verification.snapshot_path!), stringify({ ...workerResult, status: "passed" }));
    await expect(collectIndependentReview(root, "review")).rejects.toThrow("Captured independent review input changed");
  } finally { await rm(root, { recursive: true, force: true }); }
}, 30_000);

test("the request schema demands a status on captured verification and a reason on absent evidence", () => {
  const source = (files: unknown[]) => ({ mission_id: "source", source_root: "/tmp/source", files,
    reference_paths: [], acceptance: [], checks: [] });
  const contract = { kind: "contract", state: "present", original_path: "/tmp/source/mission.yaml",
    snapshot_path: ".harness/missions/review/inputs/source/contract.yaml", sha256: "a".repeat(64) };
  const digest = { snapshot_path: ".harness/missions/review/inputs/source/verification.yaml", sha256: "b".repeat(64) };
  const request = (files: unknown[]) => IndependentReviewRequestSchema.parse({
    schema_version: "uh.independent-review-request.v0", review_id: "review", sources: [source([contract, ...files])] });
  expect(() => request([{ kind: "verification", state: "present", original_path: ".harness/missions/source/verification.yaml", ...digest }]))
    .toThrow("A captured verification result must state its status");
  expect(() => request([{ kind: "verification", state: "absent", original_path: ".harness/missions/source/verification.yaml" }]))
    .toThrow("Absent worker evidence requires a reason");
  expect(() => request([{ kind: "report", state: "present", original_path: ".harness/missions/source/runs/r/runtime-final.txt",
    ...digest, status: "passed" }])).toThrow("Only a verification capture can state a verification status");
  expect(request([{ kind: "verification", state: "present", original_path: ".harness/missions/source/verification.yaml",
    ...digest, status: "waived" }]).sources[0].files[1]).toMatchObject({ status: "waived" });
});

test("an empty review report cannot satisfy the required output", async () => {
  const root = await fixture();
  try {
    const { workspace } = await executeFixture(root);
    await writeFile(path.join(workspace.path, "out", "review-report.json"), "");
    expect((await verifyMission(root, "review")).status).toBe("failed");
  } finally { await rm(root, { recursive: true, force: true }); }
}, 30_000);

test("a review cannot pass omitted criteria or missing and empty required outputs", async () => {
  const root = await fixture();
  try {
    await writeFile(path.join(root, "answer.txt"), "");
    const prepared = await prepareIndependentReview(root, { id: "review", sources: [{ missionId: "source" }], runtime: "command-code", model: "offline-review-fixture" });
    const request = IndependentReviewRequestSchema.parse(JSON.parse(await readFile(prepared.requestPath, "utf8")));
    const report = IndependentReviewReportSchema.parse({ schema_version: "uh.independent-review-report.v0", request_sha256: prepared.requestSha256,
      sources: [{ mission_id: "source", claims_checked: [{ claim: "Answer equals 42", source: "answer.txt", observed: "No answer", verdict: "unverified" }],
        acceptance: request.sources[0].acceptance.map(item => ({ id: item.id, status: "blocked", evidence: "No answer" })),
        checks: [], findings: [], verdict: "pass", reason: "Unsupported recommendation" }] });
    expect(() => validateIndependentReviewReport(request, report)).toThrow();
    report.sources[0].verdict = "needs-remediation";
    expect(validateIndependentReviewReport(request, report)).toBe("needs-remediation");
    report.sources[0].acceptance = [];
    expect(() => validateIndependentReviewReport(request, report)).toThrow();
    await rm(path.join(root, "answer.txt"));
    const missing = await prepareIndependentReview(root, { id: "missing", sources: [{ missionId: "source" }], runtime: "command-code", model: "offline-review-fixture" });
    const missingRequest = IndependentReviewRequestSchema.parse(JSON.parse(await readFile(missing.requestPath, "utf8")));
    report.sources[0].acceptance = missingRequest.sources[0].acceptance.map(item => ({ id: item.id, status: "passed", evidence: "False claim" }));
    report.sources[0].claims_checked[0].verdict = "supported";
    report.sources[0].verdict = "pass";
    expect(() => validateIndependentReviewReport(missingRequest, report)).toThrow();
    const originalPacket = await readFile(prepared.requestPath, "utf8");
    await expect(prepareIndependentReview(root, { id: "review", sources: [{ missionId: "source" }], runtime: "command-code", model: "offline-review-fixture" })).rejects.toThrow();
    expect(await readFile(prepared.requestPath, "utf8")).toBe(originalPacket);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("a review packet pins exact ids for a source with no acceptance criteria", async () => {
  const root = await fixture();
  try {
    await proposeMission(root, { id: "bare", title: "Bare", objective: "Produce answer 42", workflow: "research-docs",
      expectedOutputs: ["answer.txt"], requiredChecks: [{ name: "answer-exists" }, { name: "answer-matches-42" }] });
    const prepared = await prepareIndependentReview(root, { id: "review-bare", sources: [{ missionId: "bare" }], runtime: "command-code", model: "offline-review-fixture" });
    const missionDir = path.join(root, ".harness", "missions", "review-bare");
    const mission = parse(await readFile(path.join(missionDir, "mission.yaml"), "utf8")) as Record<string, unknown>;
    expect(mission.objective).toContain("- bare: acceptance: [] exactly; add nothing; checks: check-1, check-2.");
    expect(mission.objective).toContain("goes into observations, never into acceptance or checks");
    expect(mission.guard).toEqual({ write_roots: ["out"], deny_git_mutations: true, deny_package_installs: true, deny_network_clients: true });
    const schema = JSON.parse(await readFile(path.join(missionDir, "review-report.schema.json"), "utf8"));
    const sourceProperties = schema.properties.sources.items.properties;
    expect(sourceProperties.acceptance.maxItems).toBe(0);
    expect(sourceProperties.acceptance.items.properties.id.enum).toEqual([]);
    expect(sourceProperties.checks.maxItems).toBe(2);
    expect(sourceProperties.checks.items.properties.id.enum).toEqual(["check-1", "check-2"]);
    const request = IndependentReviewRequestSchema.parse(JSON.parse(await readFile(prepared.requestPath, "utf8")));
    expect(request.sources[0].acceptance).toEqual([]);
    expect(request.sources[0].checks.map(item => item.id)).toEqual(["check-1", "check-2"]);
    const report = { schema_version: "uh.independent-review-report.v0", request_sha256: prepared.requestSha256,
      sources: [{ mission_id: "bare", claims_checked: [{ claim: "Produce answer 42", source: "answer.txt", observed: "42", verdict: "supported" }],
        acceptance: [] as Array<{ id: string; status: "passed"; evidence: string }>,
        checks: [{ id: "check-1", status: "passed", evidence: "answer.txt exists" }, { id: "check-2", status: "passed", evidence: "answer.txt reads 42" }],
        findings: [], verdict: "pass", reason: "Both required checks hold against the captured output" }] };
    const invented = IndependentReviewReportSchema.parse({ ...report,
      sources: [{ ...report.sources[0], acceptance: [{ id: "ac-1", status: "passed", evidence: "invented criterion" }] }] });
    expect(() => validateIndependentReviewReport(request, invented)).toThrow("Review must cover each acceptance criterion exactly once");
    const withObservations = IndependentReviewReportSchema.parse({ ...report,
      sources: [{ ...report.sources[0], observations: [
        { title: "Snapshot matches the contract claim", evidence: "answer.txt", relates_to: "check-2", severity: "info" },
        { title: "No claims outside the listed ids were verified", evidence: "Review covered only the listed ids" }] }] });
    expect(validateIndependentReviewReport(request, withObservations)).toBe("pass");
    expect(validateIndependentReviewReport(request, IndependentReviewReportSchema.parse(report))).toBe("pass");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("changed captured inputs and a removed review contract invalidate collection and verification", async () => {
  const root = await fixture();
  try {
    const { workspace, missionPath } = await executeFixture(root);
    const request = JSON.parse(await readFile(path.join(root, ".harness", "missions", "review", "review-request.json"), "utf8"));
    const output = request.sources[0].files.find((file: { kind: string }) => file.kind === "output");
    await writeFile(path.join(workspace.path, output.snapshot_path), "altered");
    await expect(collectIndependentReview(root, "review")).rejects.toThrow();
    expect((await verifyMission(root, "review")).status).toBe("failed");
    const mission = parse(await readFile(missionPath, "utf8"));
    delete mission.independent_review;
    mission.sandbox.promotion_policy = "auto-on-verify";
    await writeFile(missionPath, stringify(mission));
    await expect(verifyMission(root, "review")).rejects.toThrow();
    await expect(planCommandCodeRun(workspace.path, missionPath, { artifactRoot: root })).rejects.toThrow();
  } finally { await rm(root, { recursive: true, force: true }); }
}, 30_000);
