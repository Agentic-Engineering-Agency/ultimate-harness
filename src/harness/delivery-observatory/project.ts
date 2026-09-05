import { createHash } from "node:crypto";
import { access, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { MissionSchema, type MissionDocument } from "../../schema/mission.js";
import { LatestRunPointerSchema, RunsIndexSchema, type RunsIndex } from "../../schema/runs.js";
import {
  RuntimeResultSchema,
  VerificationResultSchema,
  type RuntimeResultDocument,
  type VerificationResultDocument,
} from "../../schema/artifacts.js";
import { CanonicalTeamStateSchema, type CanonicalTeamState } from "../../schema/team.js";
import {
  DELIVERY_OBSERVATORY_CONTRACT_VERSION,
  DELIVERY_OBSERVATORY_REDACTION_VERSION,
  DeliveryObservatorySnapshotSchema,
  type DeliveryObservatorySnapshot,
  type ObservatoryValue,
} from "../../schema/delivery-observatory.js";
import { missionsDir } from "../paths.js";

const SOURCE_ID = "source-ultimate-harness-local";
const SOURCE_STALE_AFTER_MS = 60_000;

type ProjectInput = {
  now?: string;
  sourceObservedAt?: string;
};
type TeamWorkerProjection = {
  state: CanonicalTeamState["workers"][number];
  runtime: RuntimeResultDocument | null;
  observedAt: string | null;
  digest: string | null;
};

type MissionProjection = {
  mission: MissionDocument;
  missionObservedAt: string;
  missionDigest: string;
  runtime: RuntimeResultDocument | null;
  runtimeObservedAt: string | null;
  runtimeDigest: string | null;
  verification: VerificationResultDocument | null;
  verificationObservedAt: string | null;
  verificationDigest: string | null;
  runsIndex: RunsIndex | null;
  runsObservedAt: string | null;
  teamState: CanonicalTeamState | null;
  teamStateObservedAt: string | null;
  teamWorkers: TeamWorkerProjection[];
};

function opaqueId(prefix: string, ...parts: string[]): string {
  return `${prefix}-${createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 16)}`;
}

function digest(raw: string): string {
  return `sha256:${createHash("sha256").update(raw).digest("hex")}`;
}

function unknown(reason: "not_reported" | "unsupported" | "unauthorized" | "stale_source" | "conflicting_sources" | "not_comparable" = "not_reported"): ObservatoryValue {
  return { state: "unknown", reason_code: reason };
}

function known(value: string | number | boolean, evidenceRefs: string[] = []): ObservatoryValue {
  return { state: "known", value, method: "reported", evidence_refs: evidenceRefs };
}

function safeLabel(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const compact = value.replace(/\s+/g, " ").trim().slice(0, 160);
  if (!compact) return fallback;
  if (
    compact.includes("/")
    || compact.includes("\\")
    || compact.includes("@")
    || /(?:https?:|file:|~|Users|home)/i.test(compact)
  ) return fallback;
  return compact;
}

const SAFE_MODEL_NAMESPACES: Record<string, true> = {
  anthropic: true, azure: true, claude: true, cohere: true, deepseek: true, gemini: true, google: true,
  meta: true, "meta-llama": true, mistral: true, mistralai: true, nousresearch: true, openai: true,
  qwen: true, "x-ai": true,
};
const SAFE_ROUTE_COMPONENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/**
 * Native route metadata is provider-controlled and may contain arbitrary
 * diagnostics. Only compact identifiers are safe to expose; namespaced model
 * IDs are accepted for known provider namespaces, while path-like and secret-
 * looking values remain explicitly unknown.
 */
function safeRouteIdentifier(value: unknown, kind: "model" | "provider"): string | null {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) return null;
  if (
    value.length > 160
    || /[\u0000-\u001F\u007F\\\s]/.test(value)
    || /(?:https?:|file:|data:|~|bearer|api[_-]?key|credential|password|payload|secret|token|sk-[A-Za-z0-9]|-----BEGIN)/i.test(value)
  ) return null;
  if (kind === "provider") return SAFE_ROUTE_COMPONENT.test(value) ? value : null;
  const components = value.split("/");
  if (components.length === 1) return SAFE_ROUTE_COMPONENT.test(value) ? value : null;
  if (components.length !== 2 || !SAFE_ROUTE_COMPONENT.test(components[0]!) || !SAFE_ROUTE_COMPONENT.test(components[1]!)) return null;
  return SAFE_MODEL_NAMESPACES[components[0]!.toLowerCase()] ? value : null;
}

async function readYamlArtifact<T>(filePath: string, schema: { safeParse(value: unknown): { success: boolean; data?: T } }): Promise<{ data: T | null; observedAt: string | null; raw: string | null; rejected: boolean }> {
  let raw: string;
  let observedAt: string;
  try {
    const [contents, info] = await Promise.all([readFile(filePath, "utf-8"), stat(filePath)]);
    raw = contents;
    observedAt = info.mtime.toISOString();
  } catch {
    return { data: null, observedAt: null, raw: null, rejected: false };
  }
  try {
    const result = schema.safeParse(parse(raw));
    if (!result.success || result.data === undefined) {
      return { data: null, observedAt, raw: null, rejected: true };
    }
    return { data: result.data, observedAt, raw, rejected: false };
  } catch {
    return { data: null, observedAt, raw: null, rejected: true };
  }
}

async function readJsonArtifact<T>(filePath: string, schema: { safeParse(value: unknown): { success: boolean; data?: T } }): Promise<{ data: T | null; observedAt: string | null; raw: string | null; rejected: boolean }> {
  let raw: string;
  let observedAt: string;
  try {
    const [contents, info] = await Promise.all([readFile(filePath, "utf-8"), stat(filePath)]);
    raw = contents;
    observedAt = info.mtime.toISOString();
  } catch {
    return { data: null, observedAt: null, raw: null, rejected: false };
  }
  try {
    const result = schema.safeParse(JSON.parse(raw));
    if (!result.success || result.data === undefined) {
      return { data: null, observedAt, raw: null, rejected: true };
    }
    return { data: result.data, observedAt, raw, rejected: false };
  } catch {
    return { data: null, observedAt, raw: null, rejected: true };
  }
}

function latestTimestamp(values: Array<string | null | undefined>, fallback: string): string {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? fallback;
}

function recordFreshness(observedAt: string | null, now: string): "fresh" | "stale" | "unknown" {
  if (!observedAt) return "unknown";
  const age = Date.parse(now) - Date.parse(observedAt);
  if (!Number.isFinite(age)) return "unknown";
  return age > 24 * 60 * 60 * 1000 ? "stale" : "fresh";
}

function canonicalRole(role: string): "planner" | "executor" | "reviewer" | "integrator" | "judge" {
  const normalized = role.toLowerCase();
  if (normalized.includes("judge")) return "judge";
  if (normalized.includes("review") || normalized.includes("qa")) return "reviewer";
  if (normalized.includes("integrat") || normalized.includes("lead")) return "integrator";
  if (normalized.includes("plan") || normalized.includes("research")) return "planner";
  return "executor";
}

function mapOperation(
  runtime: RuntimeResultDocument | null,
  runs: RunsIndex | null,
  teamState: CanonicalTeamState | null = null,
) {
  if (teamState?.status === "running" || runs?.runs.some((run) => run.status === "running")) return "active" as const;
  if (!runtime) return "queued" as const;
  if (runtime.status === "passed") return "succeeded" as const;
  if (runtime.status === "blocked") return "blocked" as const;
  if (runtime.status === "cancelled") return "cancelled" as const;
  return "failed" as const;
}

function mapWorkerOperation(status: CanonicalTeamState["workers"][number]["status"]) {
  if (status === "running") return "active" as const;
  if (status === "succeeded") return "succeeded" as const;
  if (status === "blocked") return "blocked" as const;
  if (status === "failed" || status === "error") return "failed" as const;
  return "queued" as const;
}

function mapPhase(projection: MissionProjection): "plan" | "execute" | "review" | "verify" | "unknown" {
  if (projection.teamState?.status === "running" || projection.runsIndex?.runs.some((run) => run.status === "running")) return "execute";
  if (projection.verification) return "verify";
  if (projection.runtime) return "review";
  return projection.mission ? "plan" : "unknown";
}

function countOmittedMissionFields(mission: MissionDocument, runtime: RuntimeResultDocument | null, verification: VerificationResultDocument | null): number {
  let count = 0;
  if (mission.description) count += 1;
  count += mission.read_first.length + mission.expected_artifacts.length + mission.issues.length;
  count += mission.constraints.length + mission.context.source_links.length;
  count += mission.verification.checks.length + mission.acceptance_criteria.filter((item) => Boolean(item.check_command)).length;
  if (runtime) count += 3 + Number(Boolean(runtime.diff_path)) + runtime.errors.length + Number(Boolean(runtime.notes));
  if (verification) {
    count += verification.checks.filter((item) => Boolean(item.command) || Boolean(item.notes) || Boolean(item.reviewer)).length;
    count += verification.acceptance_criteria?.filter((item) => Boolean(item.check_command) || Boolean(item.stdout_snippet) || Boolean(item.stderr_snippet)).length ?? 0;
  }
  return count;
}

async function collectMissionProjections(root: string, missionsRoot = missionsDir(root)): Promise<{ records: MissionProjection[]; rejected: number }> {
  let entries: Array<{ name: string; isDirectory(): boolean }> = [];
  try {
    entries = await readdir(missionsRoot, { withFileTypes: true });
  } catch {
    return { records: [], rejected: 0 };
  }
  const records: MissionProjection[] = [];
  let rejected = 0;
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(missionsRoot, entry.name);
    const [mission, runtimeArtifact, verificationArtifact, runsIndex, latest] = await Promise.all([
      readYamlArtifact(path.join(dir, "mission.yaml"), MissionSchema),
      readYamlArtifact(path.join(dir, "runtime-result.yaml"), RuntimeResultSchema),
      readYamlArtifact(path.join(dir, "verification.yaml"), VerificationResultSchema),
      readJsonArtifact(path.join(dir, "runs", "index.json"), RunsIndexSchema),
      readJsonArtifact(path.join(dir, "latest.json"), LatestRunPointerSchema),
    ]);
    const runtime = runsIndex.data?.runs.some((run) => run.status === "running")
      ? { data: null, observedAt: null, raw: null, rejected: runtimeArtifact.rejected }
      : runtimeArtifact;
    let teamState: { data: CanonicalTeamState | null; observedAt: string | null; raw: string | null; rejected: boolean } = {
      data: null, observedAt: null, raw: null, rejected: false,
    };
    if (latest.data?.run_id) {
      teamState = await readJsonArtifact(
        path.join(dir, "runs", latest.data.run_id, "team-state.json"),
        CanonicalTeamStateSchema,
      );
    }
    const verification = teamState.data
      ? await readYamlArtifact(path.join(dir, "runs", teamState.data.run_id, "verification.yaml"), VerificationResultSchema)
      : verificationArtifact;
    const teamWorkers: TeamWorkerProjection[] = [];
    if (teamState.data) {
      for (const worker of teamState.data.workers) {
        if (!worker.runtime_result_path) {
          teamWorkers.push({ state: worker, runtime: null, observedAt: null, digest: null });
          continue;
        }
        const workerRuntime = await readYamlArtifact(
          path.resolve(root, worker.runtime_result_path),
          RuntimeResultSchema,
        );
        rejected += Number(workerRuntime.rejected);
        teamWorkers.push({
          state: worker,
          runtime: workerRuntime.data,
          observedAt: workerRuntime.observedAt,
          digest: workerRuntime.raw ? digest(workerRuntime.raw) : null,
        });
      }
    }
    rejected += Number(mission.rejected)
      + Number(runtime.rejected)
      + Number(verification.rejected)
      + Number(runsIndex.rejected)
      + Number(latest.rejected)
      + Number(teamState.rejected);
    if (!mission.data || !mission.observedAt) continue;
    records.push({
      mission: mission.data,
      missionObservedAt: mission.observedAt,
      missionDigest: digest(mission.raw ?? ""),
      runtime: runtime.data,
      runtimeObservedAt: runtime.observedAt,
      runtimeDigest: runtime.raw ? digest(runtime.raw) : null,
      verification: verification.data,
      verificationObservedAt: verification.observedAt,
      verificationDigest: verification.raw ? digest(verification.raw) : null,
      runsIndex: runsIndex.data,
      runsObservedAt: runsIndex.observedAt,
      teamState: teamState.data,
      teamStateObservedAt: teamState.observedAt,
      teamWorkers,
    });
  }
  return { records, rejected };
}


export async function projectDeliveryObservatory(root: string, input: ProjectInput = {}): Promise<DeliveryObservatorySnapshot> {
  const generatedAt = input.now ?? new Date().toISOString();
  const projectYaml = await readYamlArtifact(path.join(root, ".harness", "project.yaml"), {
    safeParse(value: unknown) {
      const candidate = value as { id?: unknown; name?: unknown } | null;
      return candidate && typeof candidate === "object" && (typeof candidate.id === "string" || typeof candidate.name === "string")
        ? { success: true, data: candidate }
        : { success: false };
    },
  });
  const projectSeed = typeof projectYaml.data?.id === "string" ? projectYaml.data.id : root;
  const projectId = opaqueId("project", projectSeed);
  const projectName = safeLabel(projectYaml.data?.name, "Local harness project");
  const { records, rejected } = await collectMissionProjections(root);
  const observedAt = input.sourceObservedAt ?? generatedAt;
  let omitted = 0;

  const workItems = records.map((record) => {
    omitted += countOmittedMissionFields(record.mission, record.runtime, record.verification);
    const workId = opaqueId("work", projectId, record.mission.id);
    const missionEvidenceId = opaqueId("evidence", workId, "mission");
    const runtimeEvidenceId = record.runtime ? opaqueId("evidence", workId, "runtime") : null;
    const verificationEvidenceId = record.verification ? opaqueId("evidence", workId, "verification") : null;
    const operation = mapOperation(record.runtime, record.runsIndex, record.teamState);
    const startedAt = record.teamState?.started_at ?? record.runsIndex?.runs.at(-1)?.started_at ?? record.runtime?.started_at ?? null;
    const elapsed = startedAt ? Math.max(0, Date.parse(record.teamState?.finished_at ?? record.runtime?.finished_at ?? generatedAt) - Date.parse(startedAt)) : null;
    const attentionId = record.mission.verification.review_gates.length > 0 && operation !== "succeeded"
      ? opaqueId("decision", workId, "review-gate")
      : null;
    const blockerId = operation === "blocked" ? opaqueId("event", workId, "blocked") : null;
    const runtime = record.runtime;
    const usage = runtime?.usage;
    const safeModel = safeRouteIdentifier(runtime?.model, "model");
    const safeProvider = safeRouteIdentifier(runtime?.provider, "provider");
    if (runtime?.model && !safeModel) omitted += 1;
    if (runtime?.provider && !safeProvider) omitted += 1;
    return {
      work_item_id: workId,
      source_id: SOURCE_ID,
      project_ref: projectId,
      safe_title: safeLabel(record.mission.name, "Untitled work item"),
      phase: mapPhase(record),
      operation,
      state: {
        assertion: mapPhase(record) === "plan" ? "observed" as const : "inferred" as const,
        freshness: recordFreshness(latestTimestamp([record.teamStateObservedAt, record.runsObservedAt, record.runtimeObservedAt, record.verificationObservedAt, record.missionObservedAt], generatedAt), generatedAt),
        observed_at: latestTimestamp([record.teamStateObservedAt, record.runsObservedAt, record.runtimeObservedAt, record.verificationObservedAt, record.missionObservedAt], generatedAt),
      },
      elapsed_ms: Number.isFinite(elapsed) ? elapsed : null,
      owner_agent_ref: null,
      requested_model: unknown("not_reported"),
      resolved_model: safeModel ? known(safeModel, runtimeEvidenceId ? [runtimeEvidenceId] : []) : runtime?.model ? unknown("unauthorized") : unknown("not_reported"),
      provider: safeProvider ? known(safeProvider, runtimeEvidenceId ? [runtimeEvidenceId] : []) : runtime?.provider ? unknown("unauthorized") : unknown("not_reported"),
      harness: known("Ultimate Harness", [missionEvidenceId]),
      adapter: runtime ? known(runtime.runtime, runtimeEvidenceId ? [runtimeEvidenceId] : []) : unknown("not_reported"),
      reasoning_effort: unknown("unsupported"),
      cost: runtime?.cost_usd !== undefined ? known(runtime.cost_usd, runtimeEvidenceId ? [runtimeEvidenceId] : []) : usage?.cost_usd !== undefined ? known(usage.cost_usd, runtimeEvidenceId ? [runtimeEvidenceId] : []) : unknown("not_reported"),
      tokens: usage?.total_tokens !== undefined ? known(usage.total_tokens, runtimeEvidenceId ? [runtimeEvidenceId] : []) : unknown("not_reported"),
      latency_ms: elapsed === null ? unknown("not_reported") : known(elapsed, runtimeEvidenceId ? [runtimeEvidenceId] : []),
      blocker_refs: blockerId ? [blockerId] : [],
      attention_refs: attentionId ? [attentionId] : [],
      last_evidence_ref: verificationEvidenceId ?? runtimeEvidenceId ?? missionEvidenceId,
      risk: operation === "blocked" || operation === "failed" ? "high" as const : attentionId ? "medium" as const : "unknown" as const,
    };
  });

  const evidence = records.flatMap((record) => {
    const workId = opaqueId("work", projectId, record.mission.id);
    const base: DeliveryObservatorySnapshot["evidence"] = [{
      evidence_id: opaqueId("evidence", workId, "mission"), kind: "plan" as const,
      safe_title: `${safeLabel(record.mission.name, "Work item")} mission packet`, project_ref: projectId,
      digest: record.missionDigest, media_type: "application/yaml", observed_at: record.missionObservedAt,
      classification: "internal" as const, availability: "available" as const,
    }];
    if (record.runtime) base.push({
      evidence_id: opaqueId("evidence", workId, "runtime"), kind: "route_receipt",
      safe_title: `${safeLabel(record.mission.name, "Work item")} route receipt`, project_ref: projectId,
      digest: record.runtimeDigest, media_type: "application/yaml", observed_at: record.runtimeObservedAt,
      classification: "internal", availability: "available",
    });
    if (record.verification) base.push({
      evidence_id: opaqueId("evidence", workId, "verification"), kind: "test",
      safe_title: `${safeLabel(record.mission.name, "Work item")} verification`, project_ref: projectId,
      digest: record.verificationDigest, media_type: "application/yaml", observed_at: record.verificationObservedAt,
      classification: "internal", availability: "available",
    });
    for (const worker of record.teamState?.workers ?? []) {
      const workerProjection = record.teamWorkers.find((item) => item.state.id === worker.id);
      if (!workerProjection?.runtime) continue;
      base.push({
        evidence_id: opaqueId("evidence", workId, "worker", worker.id, worker.run_id),
        kind: "route_receipt",
        safe_title: `${safeLabel(record.mission.name, "Work item")} ${safeLabel(worker.role, "worker")} route receipt`,
        project_ref: projectId,
        digest: workerProjection.digest,
        media_type: "application/yaml",
        observed_at: workerProjection.observedAt,
        classification: "internal",
        availability: "available",
      });
    }
    return base;
  });

  const decisions = records.flatMap((record) => {
    if (record.mission.verification.review_gates.length === 0 || mapOperation(record.runtime, record.runsIndex, record.teamState) === "succeeded") return [];
    const workId = opaqueId("work", projectId, record.mission.id);
    return [{
      decision_id: opaqueId("decision", workId, "review-gate"), kind: "human_gate" as const,
      safe_question: `Review gate requires attention for ${safeLabel(record.mission.name, "this work item")}.`,
      authority_label: "Configured authority", authority_href: null, state: "awaiting_answer" as const,
      risk: "medium" as const, opened_at: record.missionObservedAt, affected_work_item_refs: [workId],
      fact: { assertion: "proposed" as const, freshness: recordFreshness(record.missionObservedAt, generatedAt), observed_at: record.missionObservedAt },
    }];
  });

  const events = records.flatMap((record) => {
    const workId = opaqueId("work", projectId, record.mission.id);
    const result: DeliveryObservatorySnapshot["events"] = [{
      event_id: opaqueId("event", workId, "mission"), kind: "artifact" as const,
      occurred_at: record.missionObservedAt, safe_summary: "Mission packet observed.", work_item_ref: workId,
      evidence_refs: [opaqueId("evidence", workId, "mission")],
      state: { assertion: "observed" as const, freshness: recordFreshness(record.missionObservedAt, generatedAt), observed_at: record.missionObservedAt },
    }];
    for (const run of record.runsIndex?.runs ?? []) {
      result.push({
        event_id: opaqueId("event", workId, run.run_id),
        kind: run.status === "failed" || run.status === "blocked" ? "failure" : "status_change",
        occurred_at: run.finished_at ?? run.started_at,
        safe_summary: `Run status changed to ${run.status}.`, work_item_ref: workId,
        evidence_refs: record.runtime ? [opaqueId("evidence", workId, "runtime")] : [],
        state: { assertion: "observed", freshness: recordFreshness(record.runsObservedAt, generatedAt), observed_at: record.runsObservedAt },
      });
    }
    for (const worker of record.teamState?.workers ?? []) {
      const workerProjection = record.teamWorkers.find((item) => item.state.id === worker.id);
      const workerEventId = opaqueId("event", workId, "worker", worker.id, worker.run_id);
      result.push({
        event_id: workerEventId,
        kind: worker.status === "failed" || worker.status === "blocked" || worker.status === "error" ? "failure" : "status_change",
        occurred_at: worker.finished_at ?? worker.started_at,
        safe_summary: `Worker ${worker.role} status changed to ${worker.status}.`,
        work_item_ref: workId,
        evidence_refs: workerProjection?.runtime
          ? [opaqueId("evidence", workId, "worker", worker.id, worker.run_id)]
          : [],
        state: {
          assertion: "observed",
          freshness: recordFreshness(workerProjection?.observedAt ?? record.teamStateObservedAt, generatedAt),
          observed_at: workerProjection?.observedAt ?? record.teamStateObservedAt,
        },
      });
    }
    return result;
  });

  const metrics = [
    ["cost", "Cost per accepted outcome", "currency"], ["tokens", "Token usage", "tokens"],
    ["latency", "End-to-end latency", "ms"], ["rework", "Rework", "count"],
    ["quality", "Errors detected and escaped", "count"], ["acceptance", "Acceptance rate", "ratio"],
    ["dora", "DORA", "various"], ["product", "Product outcomes", "various"], ["pareto", "Task-shape Pareto frontier", "various"],
  ].map(([family, label, unit]) => ({
    metric_id: `metric-${family}`, family: family as "cost" | "tokens" | "latency" | "quality" | "rework" | "acceptance" | "dora" | "product" | "pareto",
    safe_label: label, task_shape_ref: null, value: unknown(family === "pareto" ? "not_comparable" : "unsupported"), unit, coverage: "unknown" as const,
  }));

  const unavailableCapabilities = [
    ...(records.some((record) => Boolean(safeRouteIdentifier(record.runtime?.model, "model") || safeRouteIdentifier(record.runtime?.provider, "provider"))) ? [] : ["model-route"]),
    ...(records.some((record) => record.runtime?.usage?.total_tokens !== undefined) ? [] : ["token-usage"]),
    ...(records.some((record) => record.runtime?.cost_usd !== undefined || record.runtime?.usage?.cost_usd !== undefined) ? [] : ["cost"]),
    "reasoning-effort",
    "dora",
    "product-metrics",
    "authority-links",
  ];

  const snapshot = {
    contract_version: DELIVERY_OBSERVATORY_CONTRACT_VERSION,
    snapshot_id: opaqueId("snapshot", projectId, generatedAt, observedAt),
    generated_at: generatedAt,
    projection_status: "partial" as const,
    window: { from: null, to: generatedAt },
    redaction: { policy_version: DELIVERY_OBSERVATORY_REDACTION_VERSION, fields_omitted: omitted, records_rejected: rejected },
    sources: [{
      source_id: SOURCE_ID, adapter_id: "ultimate-harness-filesystem.v1", producer: "Ultimate Harness",
      transport: "filesystem" as const, health: "reachable" as const, observed_at: observedAt,
      ingested_at: generatedAt, freshness: "fresh" as const, stale_after_ms: SOURCE_STALE_AFTER_MS,
      coverage: "partial" as const, omitted_fields: omitted, rejected_records: rejected,
      unavailable_capabilities: unavailableCapabilities,
    }],
    projects: [{ project_id: projectId, safe_name: projectName }],
    work_items: workItems,
    agents: records.flatMap<DeliveryObservatorySnapshot["agents"][number]>((record) => {
      const team = record.mission.team;
      if (!team) return [];
      if (record.teamState) {
        const configured = [
          ...record.teamState.workers.map((worker, index) => ({ role: worker.role, adapter: worker.adapter, index, worker })),
          {
            role: record.teamState.leader.role,
            adapter: record.teamState.leader.adapter,
            index: record.teamState.workers.length,
            leader: record.teamState.leader,
          },
        ];
        return configured.map((agent, index) => {
          const role = canonicalRole(agent.role);
          const workerStatus = "worker" in agent ? mapWorkerOperation(agent.worker.status) : agent.leader.status === "integrating" ? "active" as const : agent.leader.status === "succeeded" ? "succeeded" as const : agent.leader.status === "failed" ? "failed" as const : agent.leader.status === "blocked" ? "blocked" as const : "queued" as const;
          const observed = "worker" in agent ? agent.worker.finished_at ?? agent.worker.started_at : record.teamStateObservedAt;
          return {
            agent_id: opaqueId("agent", projectId, record.mission.id, agent.adapter, agent.role, String(agent.index), String(index)),
            safe_name: `Configured ${role}`,
            roles: [role],
            family_profile_ref: null,
            operation: workerStatus,
            state: {
              assertion: "observed" as const,
              freshness: recordFreshness(observed, generatedAt),
              observed_at: observed,
            },
          };
        });
      }
      const configured = [
        ...team.workers.flatMap((worker) => Array.from({ length: worker.count }, (_, index) => ({ role: worker.role, adapter: worker.adapter, index }))),
        { role: team.leader.role ?? "integrator", adapter: team.leader.adapter, index: 0 },
      ];
      return configured.map((agent, index) => {
        const role = canonicalRole(agent.role);
        return {
          agent_id: opaqueId("agent", projectId, record.mission.id, agent.adapter, agent.role, String(agent.index), String(index)),
          safe_name: `Configured ${role}`,
          roles: [role],
          family_profile_ref: null,
          operation: "queued" as const,
          state: { assertion: "proposed" as const, freshness: recordFreshness(record.missionObservedAt, generatedAt), observed_at: record.missionObservedAt },
        };
      });
    }),
    events,
    decisions,
    evidence,
    metrics,
  };
  return DeliveryObservatorySnapshotSchema.parse(snapshot);
}

export async function hasHarnessProject(root: string): Promise<boolean> {
  try {
    await access(path.join(root, ".harness", "project.yaml"));
    return true;
  } catch {
    return false;
  }
}
