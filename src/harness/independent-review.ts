import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, realpath, rm, lstat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { relativeArtifactPath } from "./artifact-paths.js";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { z } from "zod";
import { parse, stringify } from "yaml";
import { isDeepStrictEqual } from "node:util";
import { assertWritableArtifact } from "../adapters/_artifact-context.js";
import { IndependentReviewAssessmentSchema, IndependentReviewBindingSchema, IndependentReviewReportSchema, IndependentReviewRequestSchema,
  type IndependentReviewBinding, type IndependentReviewReport, type IndependentReviewRequest } from "../schema/independent-review.js";
import { DEFAULT_PROTECTED_PATHS, RuntimeControlSchema } from "../schema/runtime-control.js";
import { validateRuntimeResult, VerificationStatusSchema, VerificationResultSchema, type VerdictValue } from "../schema/artifacts.js";
import { loadMissionFile } from "./capabilities.js";
import { assertSafeMissionId, isPathWithin, requireInitializedProject, requireWorkflowProfile, rejectSymlinkIfExists } from "./mission.js";
import { proposeMission } from "./propose.js";
import { readLatestPointer } from "./run-id.js";
import { resolveTeamWorkerArtifactRoot } from "./team-run.js";
import { resolveSandboxMissionRoot } from "./sandbox.js";
import { writeAtomicArtifact } from "./artifact-transaction.js";
import { verifyExpectedArtifact } from "./output-verification.js";
import { recordAcceptanceDecision } from "./decision-receipts.js";
export interface PrepareIndependentReviewOptions {
  id: string;
  sources: Array<{ missionId: string; workspaceRoot?: string }>;
  runtime: IndependentReviewBinding["runtime"];
  model: string;
  workflow?: string;
}

function digest(bytes: string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function pinReportIdEnum(listSchema: unknown, ids: string[]): void {
  const list = listSchema as { maxItems?: number; items?: { properties?: { id?: Record<string, unknown> } } } | undefined;
  if (!list?.items?.properties) throw new Error("Unexpected generated review report schema shape");
  list.items.properties.id = { ...list.items.properties.id, enum: ids };
  list.maxItems = ids.length;
}

/** The report schema pinned to the exact ids this request allows; empty lists allow nothing. */
function emittedReportSchema(request: IndependentReviewRequest): Record<string, unknown> {
  const schema = z.toJSONSchema(IndependentReviewReportSchema) as { properties?: Record<string, unknown> };
  const sourceItems = (schema.properties?.sources as { items?: { properties?: Record<string, unknown> } } | undefined)?.items?.properties;
  if (!sourceItems) throw new Error("Unexpected generated review report schema shape");
  pinReportIdEnum(sourceItems.acceptance, request.sources.flatMap(source => source.acceptance.map(item => item.id)));
  pinReportIdEnum(sourceItems.checks, request.sources.flatMap(source => source.checks.map(item => item.id)));
  return schema;
}

const INDEPENDENT_REVIEW_REPORT_PATH = "out/review-report.json";

function isProtectedRuntimePath(target: string): boolean {
  const normalized = path.posix.normalize(target.trim().replaceAll("\\", "/")).replace(/^\.\/+/, "");
  return DEFAULT_PROTECTED_PATHS.some((root) => normalized === root || normalized.startsWith(`${root}/`));
}

async function readIndependentReviewReport(root: string, reportPath: string): Promise<IndependentReviewReport> {
  if (path.isAbsolute(reportPath) || isProtectedRuntimePath(reportPath)) {
    throw new Error(`Independent review report must target a permitted workspace output: ${reportPath}`);
  }
  const verification = await verifyExpectedArtifact(root, { path: reportPath, type: "json" });
  if (verification.status !== "passed") {
    throw new Error(`Independent review report failed verification: ${verification.notes ?? "missing or invalid report"}`);
  }
  return IndependentReviewReportSchema.parse(JSON.parse(await readFile(path.resolve(root, reportPath), "utf8")));
}


async function fileDigest(file: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}


const execFileP = promisify(execFile);

/** Best-effort git read: any failure (not a checkout, missing ref) yields undefined. */
async function gitOutput(cwd: string, args: string[]): Promise<string | undefined> {
  try {
    return String((await execFileP("git", ["-C", cwd, ...args])).stdout);
  } catch {
    return undefined;
  }
}

/** Protected roots whose changed files are never captured into a review packet. */
const PROTECTED_CHANGED_ROOTS = [".harness", ".commandcode", ".omp", ".git"] as const;

function isProtectedChangedPath(target: string): boolean {
  const normalized = path.posix.normalize(target.trim().replaceAll("\\", "/")).replace(/^\.\/+/, "");
  return PROTECTED_CHANGED_ROOTS.some((root) => normalized === root || normalized.startsWith(`${root}/`));
}

/**
 * The ref a worker branched from, resolved from git alone: the branch's own
 * configured fork point (`branch.<name>.base`) when present, else the
 * repository default branch. Returns undefined when none resolves.
 */
async function reviewBaseRef(worktree: string): Promise<string | undefined> {
  const branch = (await gitOutput(worktree, ["rev-parse", "--abbrev-ref", "HEAD"]))?.trim();
  if (branch && branch !== "HEAD") {
    const configured = (await gitOutput(worktree, ["config", "--get", `branch.${branch}.base`]))?.trim();
    if (configured) return configured;
  }
  for (const candidate of ["origin/HEAD", "main", "master"]) {
    if ((await gitOutput(worktree, ["rev-parse", "--verify", "--quiet", `${candidate}^{commit}`]))?.trim()) return candidate;
  }
  return undefined;
}

/**
 * Every path the worker changed between its merge-base with its base ref and
 * its HEAD. Empty when the source workspace is not a git checkout or no base
 * ref resolves.
 */
async function changedGitPaths(sourceRoot: string): Promise<string[]> {
  if ((await gitOutput(sourceRoot, ["rev-parse", "--is-inside-work-tree"]))?.trim() !== "true") return [];
  const baseRef = await reviewBaseRef(sourceRoot);
  if (!baseRef) return [];
  const mergeBase = (await gitOutput(sourceRoot, ["merge-base", baseRef, "HEAD"]))?.trim();
  if (!mergeBase) return [];
  const output = await gitOutput(sourceRoot, ["diff", "--name-only", mergeBase, "HEAD"]);
  if (output === undefined) return [];
  return output.split(/\r?\n/).map((entry) => entry.trim()).filter((entry) => entry.length > 0);
}

/**
 * Copy an absolute file into the packet under `containmentRoot`, hashing it in
 * the same pass. `undefined` when the file does not exist; containment is
 * enforced on both the requested path and its realpath.
 */
async function snapshotWithin(containmentRoot: string, candidate: string, destination: string): Promise<string | undefined> {
  const absolute = path.resolve(candidate);
  if (!isPathWithin(absolute, containmentRoot)) throw new Error(`Review input escapes its source workspace: ${candidate}`);
  let resolved: string;
  try { resolved = await realpath(absolute); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
  if (!isPathWithin(resolved, containmentRoot)) throw new Error(`Review input resolves outside its source workspace: ${candidate}`);
  if (!(await lstat(absolute)).isFile()) return undefined;
  const hash = createHash("sha256");
  await pipeline(createReadStream(resolved), new Transform({
    transform(chunk, _encoding, callback) { hash.update(chunk); callback(null, chunk); },
  }), createWriteStream(destination, { flags: "wx" }));
  return hash.digest("hex");
}

async function snapshotFile(sourceRoot: string, original: string, destination: string): Promise<string | undefined> {
  return snapshotWithin(sourceRoot, path.resolve(sourceRoot, original), destination);
}

/**
 * What `uh verify` concluded in the source workspace, read back from the
 * snapshot just taken. An unreadable result is surfaced as `blocked` with its
 * cause rather than dropped: the reviewer must see the file and know why it
 * carries no trustworthy status.
 */
async function verificationEvidence(snapshot: string): Promise<{ status: z.infer<typeof VerificationStatusSchema>; reason?: string }> {
  try {
    return { status: VerificationResultSchema.parse(parse(await readFile(snapshot, "utf8"))).status };
  } catch {
    return { status: "blocked", reason: "the captured verification.yaml does not parse as a uh.verification-result.v0 document" };
  }
}

/** Emit a complete UH mission; preparation never starts a model or another controller. */
export async function prepareIndependentReview(root: string, options: PrepareIndependentReviewOptions) {
  assertSafeMissionId(options.id);
  if (options.sources.length === 0 || new Set(options.sources.map(source => source.missionId)).size !== options.sources.length) {
    throw new Error("Independent review requires distinct source missions");
  }
  for (const source of options.sources) {
    assertSafeMissionId(source.missionId);
    if (source.missionId === options.id) throw new Error("A mission cannot independently review itself");
  }
  root = await realpath(root);
  const workflow = options.workflow ?? "research-docs";
  await requireInitializedProject(root);
  await requireWorkflowProfile(root, workflow);
  const missionDir = path.join(root, ".harness", "missions", options.id);
  await rejectSymlinkIfExists(path.join(root, ".harness"), "Harness directory");
  await rejectSymlinkIfExists(path.dirname(missionDir), "Missions directory");
  const requestPath = path.join(missionDir, "review-request.json");
  const reportPath = path.join(root, INDEPENDENT_REVIEW_REPORT_PATH);
  const requestRelative = relativeArtifactPath(root, requestPath);
  const reportRelative = relativeArtifactPath(root, reportPath);
  const routing = IndependentReviewBindingSchema.pick({ runtime: true, model: true })
    .parse({ runtime: options.runtime, model: options.model });
  // An existing packet or abandoned preparation is never silently overwritten.
  await mkdir(missionDir);
  try {
    const sources: IndependentReviewRequest["sources"] = [];
    const readFirst: string[] = [requestRelative];
    const workerEvidence: string[] = [];
    for (const source of options.sources) {
      const canonicalContract = path.join(root, ".harness", "missions", source.missionId, "mission.yaml");
      await assertWritableArtifact(path.dirname(canonicalContract), canonicalContract);
      const route = await resolveSandboxMissionRoot(root, canonicalContract, true);
      if (route.error) throw new Error(route.error);
      const sourceRoot = await realpath(source.workspaceRoot ?? route.effectiveRoot);
      const inputDir = path.join(missionDir, "inputs", source.missionId);
      await mkdir(inputDir, { recursive: true });
      const contractSnapshot = path.join(inputDir, "contract.yaml");
      const contractHash = await snapshotFile(root, relativeArtifactPath(root, canonicalContract), contractSnapshot);
      if (!contractHash) throw new Error(`Source mission contract is missing: ${source.missionId}`);
      const mission = await loadMissionFile(contractSnapshot);
      if (mission.id !== source.missionId) throw new Error("Source mission identity mismatch");
      const files: IndependentReviewRequest["sources"][number]["files"] = [{ kind: "contract", state: "present",
        original_path: canonicalContract, snapshot_path: relativeArtifactPath(root, contractSnapshot), sha256: contractHash }];
      readFirst.push(relativeArtifactPath(root, contractSnapshot));
      for (const [index, output] of mission.expected_artifacts.entries()) {
        const snapshot = path.join(inputDir, `${index}-${path.basename(output.path)}`);
        const hash = await snapshotFile(sourceRoot, output.path, snapshot);
        const verification = await verifyExpectedArtifact(hash ? root : sourceRoot,
          hash ? { ...output, path: relativeArtifactPath(root, snapshot) } : output);
        files.push({ kind: "output", original_path: output.path, state: hash ? "present" : "missing", verification,
          ...(hash ? { snapshot_path: relativeArtifactPath(root, snapshot), sha256: hash } : {}) });
        if (hash) readFirst.push(relativeArtifactPath(root, snapshot));
      }
      // Workers legitimately touch companion files outside their declared
      // outputs. When the source workspace is a git worktree, capture the real
      // diff so the review judges those files too. Protected roots and files
      // already captured above are never duplicated.
      const captured = new Set(files.map(file => file.original_path.replaceAll("\\", "/")));
      for (const [index, changedPath] of (await changedGitPaths(sourceRoot)).entries()) {
        const normalized = changedPath.replaceAll("\\", "/");
        if (isProtectedChangedPath(normalized) || captured.has(normalized)) continue;
        captured.add(normalized);
        const snapshot = path.join(inputDir, `changed-${index}-${path.basename(normalized)}`);
        const hash = await snapshotFile(sourceRoot, normalized, snapshot);
        if (hash) {
          files.push({ kind: "changed", original_path: normalized, state: "present",
            snapshot_path: relativeArtifactPath(root, snapshot), sha256: hash });
          readFirst.push(relativeArtifactPath(root, snapshot));
        } else {
          files.push({ kind: "changed", original_path: normalized, state: "absent" });
        }
      }
      // The worker's own evidence lives under `.harness`, which the protected
      // path rules keep out of the changed-file walk above, so both files are
      // captured explicitly by name. A missing one is recorded with a reason:
      // reviewers must be able to tell "the worker never produced it" from "the
      // packet did not look".
      const evidence: string[] = [];
      const verificationOriginal = path.posix.join(".harness", "missions", source.missionId, "verification.yaml");
      const verificationSnapshot = path.join(inputDir, "verification.yaml");
      const verificationHash = await snapshotFile(sourceRoot, verificationOriginal, verificationSnapshot);
      if (verificationHash) {
        const snapshotRelative = relativeArtifactPath(root, verificationSnapshot);
        const status = await verificationEvidence(verificationSnapshot);
        files.push({ kind: "verification", original_path: verificationOriginal, state: "present",
          snapshot_path: snapshotRelative, sha256: verificationHash, ...status });
        readFirst.push(snapshotRelative);
        evidence.push(`verification ${snapshotRelative} with status ${status.status}${status.reason ? ` (${status.reason})` : ""}`);
      } else {
        const reason = "the source workspace has no verification.yaml, so uh verify has never run there";
        files.push({ kind: "verification", original_path: verificationOriginal, state: "absent", reason });
        evidence.push(`verification absent (${reason})`);
      }
      const finalSnapshot = path.join(inputDir, "runtime-final.txt");
      const latestRun = await readLatestPointer(sourceRoot, source.missionId);
      // A team worker writes its run records outside its own worktree, under
      // the team's artifact root; resolve that root through the team's run
      // pointer and team-state.json, never by guessing the newest directory. A
      // standalone source keeps reading its own workspace.
      const teamLookup = latestRun ? undefined : await resolveTeamWorkerArtifactRoot(sourceRoot);
      let finalOriginal: string;
      let finalHash: string | undefined;
      let absentReason: string;
      if (latestRun) {
        finalOriginal = path.posix.join(".harness", "missions", source.missionId, "runs", latestRun.run_id, "runtime-final.txt");
        finalHash = await snapshotFile(sourceRoot, finalOriginal, finalSnapshot);
        absentReason = `the latest run ${latestRun.run_id} wrote no runtime-final.txt`;
      } else if (teamLookup && "artifactRoot" in teamLookup) {
        const artifactLatest = await readLatestPointer(teamLookup.artifactRoot, source.missionId);
        const artifactFinal = artifactLatest
          ? path.join(teamLookup.artifactRoot, ".harness", "missions", source.missionId, "runs", artifactLatest.run_id, "runtime-final.txt")
          : path.join(teamLookup.artifactRoot, ".harness", "missions", source.missionId, "latest.json");
        finalOriginal = relativeArtifactPath(root, artifactFinal);
        if (artifactLatest) {
          finalHash = await snapshotWithin(teamLookup.artifactRoot, artifactFinal, finalSnapshot);
          absentReason = `the latest run ${artifactLatest.run_id} wrote no runtime-final.txt`;
        } else {
          absentReason = "the worker artifact root has no latest.json run pointer, so no run's final message can be located";
        }
      } else {
        finalOriginal = path.posix.join(".harness", "missions", source.missionId, "latest.json");
        absentReason = teamLookup
          ? teamLookup.reason
          : "the source workspace has no latest.json run pointer, so no run's final message can be located";
      }
      if (finalHash) {
        const snapshotRelative = relativeArtifactPath(root, finalSnapshot);
        files.push({ kind: "report", original_path: finalOriginal, state: "present",
          snapshot_path: snapshotRelative, sha256: finalHash });
        readFirst.push(snapshotRelative);
        evidence.push(`final message ${snapshotRelative}`);
      } else {
        files.push({ kind: "report", original_path: finalOriginal, state: "absent", reason: absentReason });
        evidence.push(`final message absent (${absentReason})`);
      }
      workerEvidence.push(`- ${source.missionId}: ${evidence.join("; ")}.`);
      sources.push({ mission_id: source.missionId, source_root: sourceRoot, files,
        reference_paths: mission.read_first,
        acceptance: mission.acceptance_criteria.map(criterion => ({ id: criterion.id, description: criterion.description })),
        checks: mission.verification.checks.map((check, index) => ({ id: `check-${index + 1}`, description: check })),
      });
    }
    const request = IndependentReviewRequestSchema.parse({ schema_version: "uh.independent-review-request.v0", review_id: options.id, sources });
    const serialized = JSON.stringify(request, null, 2) + "\n";
    const binding = IndependentReviewBindingSchema.parse({ ...routing, request_path: requestRelative,
      report_path: reportRelative, request_sha256: digest(serialized) });
    await writeFile(requestPath, serialized, { flag: "wx" });
    const schemaPath = path.join(missionDir, "review-report.schema.json");
    await writeFile(schemaPath, JSON.stringify(emittedReportSchema(request), null, 2), { flag: "wx" });
    readFirst.push(relativeArtifactPath(root, schemaPath));
    const idClause = (ids: string[]) => ids.length > 0 ? ids.join(", ") : "[] exactly; add nothing";
    const requiredIds = sources.map(source => `- ${source.mission_id}: acceptance: ${idClause(source.acceptance.map(item => item.id))}; checks: ${idClause(source.checks.map(item => item.id))}.`).join("\n");
    const packet = await proposeMission(root, {
      id: options.id, title: `Independent review: ${options.sources.map(source => source.missionId).join(", ")}`, workflow,
      objective: `Independently assess the captured contracts and outputs in ${binding.request_path}. Read every captured contract and available output in full. Check claims against sources, cover exactly the ids listed below once each, and report missing or unverifiable evidence honestly. The report must contain exactly these ids per source, each exactly once:\n${requiredIds}\nAnything you verified that no listed id covers goes into observations, never into acceptance or checks. Worker-side evidence captured per source:\n${workerEvidence.join("\n")}\nGrade a required check against the captured verification result and the captured outputs; the worker's own final message is a claim to compare against that evidence, never proof of it. An absent capture is missing evidence to report, not a failure to invent. Write ${binding.report_path} conforming to the supplied JSON schema and bind it to request_sha256 ${binding.request_sha256}. Missing outputs require needs-remediation; unverified required evidence cannot receive pass. This is an advisory recommendation, not Main/owner acceptance.`,
      readFirst, expectedOutputs: [binding.report_path], sandboxBackend: "directory", promotionPolicy: "human-approved",
      constraints: ["Do not edit source worker outputs or captured review inputs.", "Do not delegate, spawn subagents, or reuse a worker session.",
        "Reference paths are relative to each source_root; captured snapshots, not later source changes, define this review."],
      runtimeConfigOverrides: { model: binding.model, ...(binding.runtime === "oh-my-pi" ? { honcho_memory: false } : {}) }, independentReview: binding,
      completionCriteria: ["Every source has an evidence-backed recommendation; Main/owner acceptance remains required."],
    });
    const guardedMission = { ...packet.mission, guard: {
      write_roots: [path.posix.dirname(binding.report_path)],
      deny_git_mutations: true, deny_package_installs: true, deny_network_clients: true,
    } };
    await writeFile(packet.path, stringify(guardedMission), "utf-8");
    // `reportPath` is reported relative to the review workspace (and so to the
    // sandbox worktree the reviewer runs in), never as an absolute project path.
    return { missionPath: packet.path, requestPath, reportPath: binding.report_path, requestSha256: binding.request_sha256 };
  } catch (error) {
    await rm(missionDir, { recursive: true, force: true });
    throw error;
  }
}

function exactIds(expected: string[], actual: string[], label: string): void {
  if (actual.length !== expected.length || new Set(actual).size !== actual.length || actual.some(id => !expected.includes(id))) {
    throw new Error(`Review must cover each ${label} exactly once`);
  }
}

export function validateIndependentReviewReport(request: IndependentReviewRequest, report: IndependentReviewReport): VerdictValue {
  exactIds(request.sources.map(source => source.mission_id), report.sources.map(source => source.mission_id), "source mission");
  let recommendation: VerdictValue = "pass";
  for (const source of request.sources) {
    const reviewed = report.sources.find(item => item.mission_id === source.mission_id)!;
    exactIds(source.acceptance.map(item => item.id), reviewed.acceptance.map(item => item.id), "acceptance criterion");
    exactIds(source.checks.map(item => item.id), reviewed.checks.map(item => item.id), "required check");
    const missing = source.files.some(file => file.state === "missing" || (file.kind === "output" && file.verification?.status !== "passed"));
    const unsupported = reviewed.claims_checked.some(claim => claim.verdict !== "supported") ||
      [...reviewed.acceptance, ...reviewed.checks].some(check => check.status !== "passed") ||
      reviewed.findings.some(finding => finding.severity === "error");
    if (missing && reviewed.verdict !== "needs-remediation") throw new Error("Missing or invalid review inputs require needs-remediation");
    if (unsupported && reviewed.verdict === "pass") throw new Error("Unverified or contradicted evidence cannot receive pass");
    if (reviewed.verdict === "needs-remediation" || (reviewed.verdict === "needs-attention" && recommendation === "pass")) recommendation = reviewed.verdict;
  }
  return recommendation;
}

/** Validate provenance and recommendation; never records a human approval or promotes source work. */
export async function collectIndependentReview(root: string, missionId: string) {
  assertSafeMissionId(missionId);
  root = await realpath(root);
  const missionDir = path.join(root, ".harness", "missions", missionId);
  const missionPath = path.join(missionDir, "mission.yaml");
  await assertWritableArtifact(missionDir, missionPath);
  const mission = await loadMissionFile(missionPath);
  const binding = mission.independent_review;
  if (!binding) throw new Error("Mission is not an independent review packet");
  const requestPath = path.resolve(root, binding.request_path);
  await assertWritableArtifact(missionDir, requestPath);
  const requestBytes = await readFile(requestPath, "utf8");
  if (digest(requestBytes) !== binding.request_sha256) throw new Error("Independent review request changed after preparation");
  const request = IndependentReviewRequestSchema.parse(JSON.parse(requestBytes));
  if (request.review_id !== missionId) throw new Error("Independent review request identity mismatch");
  const latest = await readLatestPointer(root, missionId);
  if (!latest) throw new Error("Independent review has no native execution receipt");
  const controlPath = path.join(missionDir, "runs", latest.run_id, "runtime-control.json");
  await assertWritableArtifact(missionDir, controlPath);
  const control = RuntimeControlSchema.parse(JSON.parse(await readFile(controlPath, "utf8")));
  if (control.mission_id !== missionId || control.run_id !== latest.run_id || control.runtime !== binding.runtime ||
      control.status !== "passed" || control.settlement_confirmed === false || control.review_request_sha256 !== binding.request_sha256) {
    throw new Error("Independent review requires a successful native receipt bound to this request");
  }
  const resultPath = path.join(missionDir, "runs", latest.run_id, "runtime-result.yaml");
  await assertWritableArtifact(missionDir, resultPath);
  if (validateRuntimeResult(parse(await readFile(resultPath, "utf8"))).status !== "passed") {
    throw new Error("Independent reviewer runtime did not complete successfully");
  }
  const route = await resolveSandboxMissionRoot(root, missionPath, true);
  if (route.error) throw new Error(route.error);
  if (!route.sandbox) throw new Error("Independent review requires its bound UH workspace");
  if (!isDeepStrictEqual(await loadMissionFile(route.missionPath), mission)) throw new Error("Independent review contract changed in its workspace");
  const workspaceRequest = path.resolve(route.effectiveRoot, binding.request_path);
  await assertWritableArtifact(path.dirname(route.missionPath), workspaceRequest);
  if (await fileDigest(workspaceRequest) !== binding.request_sha256) throw new Error("Independent review request changed in its workspace");
  for (const source of request.sources) {
    for (const file of source.files) {
      if (file.state !== "present") continue;
      for (const scope of new Set([root, route.effectiveRoot])) {
        const snapshot = path.resolve(scope, file.snapshot_path!);
        await assertWritableArtifact(path.join(scope, ".harness", "missions", missionId), snapshot);
        if (await fileDigest(snapshot) !== file.sha256) throw new Error("Captured independent review input changed");
      }
    }
  }
  const report = await readIndependentReviewReport(route.effectiveRoot, binding.report_path);
  if (report.request_sha256 !== binding.request_sha256) throw new Error("Review report belongs to another request");
  let recommendation = validateIndependentReviewReport(request, report);
  await recordAcceptanceDecision({
    missionDir, missionId, runId: latest.run_id, consumer: "independent-review", from: recommendation,
    state: {
      contract: {
        human_acceptance_required: true,
        sources: request.sources.map((source, index) => ({
          index, acceptance: source.acceptance, checks: source.checks,
          inputs: source.files.map(file => ({ kind: file.kind, state: file.state })),
        })),
      },
      outputs: {
        recommendation,
        sources: request.sources.map((source, index) => {
          const reviewed = report.sources.find(item => item.mission_id === source.mission_id)!;
          return {
            index, verdict: reviewed.verdict,
            claims: reviewed.claims_checked.map(claim => ({ verdict: claim.verdict })),
            acceptance: reviewed.acceptance.map(check => ({ id: check.id, status: check.status })),
            checks: reviewed.checks.map(check => ({ id: check.id, status: check.status })),
            findings: reviewed.findings.map(finding => ({ severity: finding.severity })),
          };
        }),
      },
    },
    prompt: "Assess consistency of the review disposition with the supplied evidence summary. Raw evidence is not included; do not infer that unreported checks or scope protections passed.",
    apply: gate => {
      if (gate.tamper || gate.verdict === "needs-remediation") {
        recommendation = "needs-remediation";
      } else if (gate.verdict === "needs-attention" && recommendation === "pass") {
        recommendation = "needs-attention";
      }
      return recommendation;
    },
  });
  const observations = report.sources.flatMap(source =>
    (source.observations ?? []).map(observation => ({ source: source.mission_id, ...observation })));
  // Preserve the reviewer's stated reasons on the canonical assessment: without
  // these a needs-attention/needs-remediation recommendation carries no cause.
  const findings = report.sources.flatMap(source =>
    source.findings.map(finding => ({ source: source.mission_id, severity: finding.severity, detail: finding.detail, evidence: finding.evidence })));
  const claims = report.sources.flatMap(source =>
    source.claims_checked.map(claim => ({ source: source.mission_id, claim: claim.claim, verdict: claim.verdict, evidence_source: claim.source })));
  const assessment = IndependentReviewAssessmentSchema.parse({ schema_version: "uh.independent-review-assessment.v0", review_id: missionId,
    run_id: latest.run_id, request_sha256: binding.request_sha256, recommendation, human_acceptance_required: true,
    ...(observations.length > 0 ? { observations } : {}),
    ...(findings.length > 0 ? { findings } : {}),
    ...(claims.length > 0 ? { claims } : {}) });
  const assessmentPath = path.join(missionDir, "review-assessment.json");
  await assertWritableArtifact(missionDir, assessmentPath);
  await writeAtomicArtifact(assessmentPath, JSON.stringify(assessment, null, 2));
  return assessment;
}
