import { test, expect } from "vitest";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { parse, stringify } from "yaml";
import { initializeHarness } from "../src/harness/init.js";
import { addAdapter } from "../src/harness/adapter-add.js";
import { proposeMission } from "../src/harness/propose.js";
import { prepareIndependentReview, collectIndependentReview, validateIndependentReviewReport } from "../src/harness/independent-review.js";
import { IndependentReviewRequestSchema, IndependentReviewReportSchema } from "../src/schema/independent-review.js";
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

const reviewerFixture = `const fs = require('node:fs');
const path = require('node:path');
const requestBase = '.harness/missions/review/';
const reportPath = 'out/review-report.json';
const request = JSON.parse(fs.readFileSync(requestBase + 'review-request.json', 'utf8'));
const report = {schema_version:'uh.independent-review-report.v0', request_sha256: process.argv[process.argv.indexOf('-p')+1].match(/request_sha256 ([a-f0-9]{64})/)[1],
 sources:request.sources.map(source => {
  const output = source.files.find(file => file.kind === 'output');
  const observed = fs.readFileSync(output.snapshot_path, 'utf8');
  const passed = observed === '42';
  return {mission_id:source.mission_id, claims_checked:[{claim:'Answer equals 42',source:output.snapshot_path,observed,verdict:passed?'supported':'contradicted'}],
   acceptance:source.acceptance.map(item=>({id:item.id,status:passed?'passed':'failed',evidence:observed})),
   checks:source.checks.map(item=>({id:item.id,status:passed?'passed':'failed',evidence:observed})), findings:[], verdict:passed?'pass':'needs-remediation',reason:'Compared captured answer to 42'};
 })};
fs.mkdirSync(path.dirname(reportPath), {recursive:true});
fs.writeFileSync(reportPath, JSON.stringify(report));
console.log(JSON.stringify({type:'event',event:{type:'model_request_start',model:'offline-review-fixture'}}));
console.log(JSON.stringify({type:'result',subtype:'success',finalText:'Review complete',stopReason:'end_turn'}));
`;

async function executeFixture(root: string) {
  const executable = path.join(root, "reviewer.cjs");
  await writeFile(executable, reviewerFixture);
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
  reviewMission.guard = { write_roots: ["out"] };
  await writeFile(reviewMissionPath, stringify(reviewMission));
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
    expect((await verifyMission(root, "review")).status).toBe("passed");
    expect(await readFile(path.join(root, "answer.txt"), "utf8")).toBe("42");
    await expect(readFile(path.join(root, ".harness", "missions", "source", "promotion.yaml"))).rejects.toThrow();
    await expect(planCommandCodeRun(root, path.join(root, ".harness", "missions", "review", "mission.yaml"))).rejects.toThrow();
    await expect(planCommandCodeRun(workspace.path, missionPath, { artifactRoot: root, extraRuntimeConfigOverrides: { resume_session: "worker-session" } })).rejects.toThrow();
    await expect(planCommandCodeRun(workspace.path, missionPath, { artifactRoot: root, extraRuntimeConfigOverrides: { model: "another-model" } })).rejects.toThrow();
  } finally { await rm(root, { recursive: true, force: true }); }
}, 30_000);

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
