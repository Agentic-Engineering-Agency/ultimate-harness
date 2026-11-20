import { z } from "zod";

// FIXTURE ONLY. A deterministic in-memory stand-in for the AE worker contract
// (design package worker/worker-adapter.ts) so UH lifecycle rules can be tested
// without a native runner. It is not a process sandbox, does not launch a CLI,
// and its event log is in-memory and NOT durable. See
// docs/architecture/proactive-pilot-workers.md.

export const PILOT_WORKER_PROTOCOL = "ae.worker/1" as const;
export const WORKER_CAPABILITIES = [
  "external.read", "internal.note.write", "internal.artifact.write",
  "workspace.edit", "test.execute", "review.read_only", "private.preview",
] as const;
export type WorkerCapability = (typeof WORKER_CAPABILITIES)[number];

const Uuid = z.uuid();
const ArtifactRefSchema = z.object({ id: Uuid, sha256: z.string().regex(/^[0-9a-f]{64}$/) }).strict();
const CommitRefSchema = z.object({ repositoryId: z.string().min(1), sha: z.string().regex(/^[0-9a-f]{40}$/) }).strict();
const AttemptContextSchema = z.object({
  missionId: Uuid,
  attemptId: Uuid,
  taskEpoch: z.int().positive(),
}).strict();

export const PilotStartRequestSchema = AttemptContextSchema.extend({
  mode: z.enum(["implementation", "independent_review"]),
  acceptedPlan: ArtifactRefSchema,
  spec: ArtifactRefSchema,
  acceptanceCriteria: ArtifactRefSchema,
  originalBaseCommit: CommitRefSchema,
  candidateToReview: CommitRefSchema.optional(),
  requiredCapabilities: z.array(z.string()).min(1),
  budget: z.object({ reservationId: Uuid, maxCostMicroUsd: z.int().nonnegative() }).strict(),
}).strict().superRefine((r, ctx) => {
  if ((r.mode === "independent_review") !== (r.candidateToReview !== undefined)) {
    ctx.addIssue({ code: "custom", path: ["candidateToReview"], message: "required for review, forbidden otherwise" });
  }
  if (r.candidateToReview && r.candidateToReview.repositoryId !== r.originalBaseCommit.repositoryId) {
    ctx.addIssue({ code: "custom", path: ["candidateToReview"], message: "must be in the base repository" });
  }
});

export type ArtifactRef = z.infer<typeof ArtifactRefSchema>;
export type CommitRef = z.infer<typeof CommitRefSchema>;
export type AttemptContext = z.infer<typeof AttemptContextSchema>;
export type PilotStartRequest = z.infer<typeof PilotStartRequestSchema>;

export type WorkerState = "running" | "cancel_requested" | "quiescent" | "blocked" | "completed";
export type FailureCode =
  | "invalid_request" | "unsupported_capability" | "policy_denied" | "stale_epoch"
  | "unknown_effect" | "integrity_conflict";
export interface WorkerFailure {
  code: FailureCode;
  message: string;
  missingCapabilities?: string[];
  unresolvedEffectIds?: string[];
}
export type Result<T> = { ok: true; value: T } | { ok: false; error: WorkerFailure };

export interface CancellationReceipt {
  acknowledgment: "request_recorded" | "quiescence_proven";
  quiescent: boolean;
  proofRef?: ArtifactRef;
  cursor: string;
}
export interface WorkerSnapshot { attemptId: string; taskEpoch: number; state: WorkerState; cursor: string; blockedEffectIds: string[] }
export interface CheckpointReceipt { checkpointCommit: CommitRef; quiescenceProof: ArtifactRef; unresolvedEffectIds: [] }
export interface ExportBundle {
  missionId: string; attemptId: string; taskEpoch: number; mode: PilotStartRequest["mode"];
  originalBaseCommit: CommitRef; candidateCommit: CommitRef; spec: ArtifactRef; acceptanceCriteria: ArtifactRef;
  budgetReservationId: string; maxCostMicroUsd: number; cursor: string;
}

interface EventData {
  "task.started": { mode: PilotStartRequest["mode"] };
  "task.cancel.requested": { reason: string };
  "task.cancel.ack": CancellationReceipt;
  "task.blocked": { effectIds: string[] };
  "artifact.exported": { candidateCommit: CommitRef };
  "stream.gap": { requestedCursor: string; earliestAvailableCursor: string; snapshotRequired: true };
  "stream.snapshot": WorkerSnapshot;
}
export type WorkerEvent = {
  [K in keyof EventData]: { attemptId: string; taskEpoch: number; sequence: number; cursor: string; type: K; data: EventData[K] };
}[keyof EventData];

/** Lifecycle surface UH drives. Synchronous because the only implementation is a fixture. */
export interface PilotWorkerAdapter {
  readonly supported: readonly WorkerCapability[];
  start(request: unknown): Result<WorkerSnapshot>;
  /** Attempt a tool effect. `outcome: "unknown"` models a call whose external result was lost. */
  perform(ctx: AttemptContext, effect: { effectId: string; capability: string; outcome: "committed" | "unknown" }): Result<{ effectId: string }>;
  recordCandidate(ctx: AttemptContext, commit: CommitRef): Result<CommitRef>;
  cancel(ctx: AttemptContext, reason: string): Result<CancellationReceipt>;
  proveQuiescence(ctx: AttemptContext, proofRef: ArtifactRef): Result<CancellationReceipt>;
  /** UH-only: revoke the current epoch. Commands carrying an older epoch are rejected afterwards. */
  fence(nextEpoch: number): Result<WorkerSnapshot>;
  checkpoint(ctx: AttemptContext): Result<CheckpointReceipt>;
  exportArtifacts(ctx: AttemptContext, expectedCandidate: CommitRef): Result<ExportBundle>;
  streamEvents(ctx: AttemptContext, after?: string): Result<WorkerEvent[]>;
}

const err = <T>(code: FailureCode, message: string, extra: Partial<WorkerFailure> = {}): Result<T> =>
  ({ ok: false, error: { code, message, ...extra } });
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const sameCommit = (a: CommitRef, b: CommitRef) => a.repositoryId === b.repositoryId && a.sha === b.sha;

export class FakePilotWorker implements PilotWorkerAdapter {
  private req?: PilotStartRequest;
  private epoch = 0;
  private state: WorkerState = "running";
  private candidate?: CommitRef;
  private quiescenceProof?: ArtifactRef;
  private cancellationReceipt?: CancellationReceipt;
  private readonly unknownEffects: string[] = [];
  private readonly log: WorkerEvent[] = [];
  private seq = 0;

  /** `retainEvents` bounds the in-memory log so replay gaps are reachable in tests. */
  constructor(readonly supported: readonly WorkerCapability[] = WORKER_CAPABILITIES, private readonly retainEvents = 100) {}

  start(request: unknown): Result<WorkerSnapshot> {
    if (this.req) return err("invalid_request", "attempt already started; a new attempt needs a new worker");
    const parsed = PilotStartRequestSchema.safeParse(request);
    if (!parsed.success) return err("invalid_request", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    const r = parsed.data;
    const notWorker = r.requiredCapabilities.filter((c) => !(WORKER_CAPABILITIES as readonly string[]).includes(c));
    if (notWorker.length) return err("policy_denied", `capabilities never available to pilot workers: ${notWorker.join(", ")}`);
    const missing = r.requiredCapabilities.filter((c) => !(this.supported as readonly string[]).includes(c));
    if (missing.length) return err("unsupported_capability", `adapter lacks: ${missing.join(", ")}`, { missingCapabilities: missing });
    if (r.mode === "independent_review"
      && (!r.requiredCapabilities.includes("review.read_only") || r.requiredCapabilities.includes("workspace.edit"))) {
      return err("policy_denied", "independent review is read-only: requires review.read_only, forbids workspace.edit");
    }
    this.req = r;
    this.epoch = r.taskEpoch;
    this.emit("task.started", { mode: r.mode });
    return ok(this.snapshot());
  }

  perform(ctx: AttemptContext, effect: { effectId: string; capability: string; outcome: "committed" | "unknown" }) {
    const bad = this.check(ctx);
    if (bad) return bad;
    if (this.state !== "running") return err<{ effectId: string }>("policy_denied", `no new effects while ${this.state}`);
    if (!this.req!.requiredCapabilities.includes(effect.capability)) {
      return err<{ effectId: string }>("policy_denied", `capability not granted for this attempt: ${effect.capability}`);
    }
    if (effect.outcome === "unknown") this.unknownEffects.push(effect.effectId);
    return ok({ effectId: effect.effectId });
  }

  recordCandidate(ctx: AttemptContext, commit: CommitRef) {
    const bad = this.check(ctx);
    if (bad) return bad;
    if (this.state !== "running") return err<CommitRef>("policy_denied", `candidate cannot change while ${this.state}`);
    const c = CommitRefSchema.safeParse(commit);
    if (!c.success) return err<CommitRef>("invalid_request", "candidate must be a full 40-hex commit");
    if (!this.req!.requiredCapabilities.includes("workspace.edit") || this.req!.mode !== "implementation") {
      return err<CommitRef>("policy_denied", "only an implementation attempt with workspace.edit may produce a candidate");
    }
    if (c.data.repositoryId !== this.req!.originalBaseCommit.repositoryId) {
      return err<CommitRef>("integrity_conflict", "candidate is not in the base repository");
    }
    this.candidate = c.data;
    return ok(c.data);
  }

  cancel(ctx: AttemptContext, reason: string) {
    const bad = this.check(ctx);
    if (bad) return bad;
    if (this.state === "completed" || this.state === "blocked") {
      return err<CancellationReceipt>("policy_denied", `cannot cancel while ${this.state}`);
    }
    if (this.cancellationReceipt) return ok(this.cancellationReceipt);
    this.state = "cancel_requested";
    this.emit("task.cancel.requested", { reason });
    // A recorded request is not quiescence: native work may still be running.
    const receipt: CancellationReceipt = { acknowledgment: "request_recorded", quiescent: false, cursor: `${this.req!.attemptId}:${this.seq + 1}` };
    this.emit("task.cancel.ack", receipt);
    this.cancellationReceipt = receipt;
    return ok(receipt);
  }

  proveQuiescence(ctx: AttemptContext, proofRef: ArtifactRef) {
    const bad = this.check(ctx);
    if (bad) return bad;
    if (this.state !== "cancel_requested") return err<CancellationReceipt>("invalid_request", "cancel must be requested first");
    if (!ArtifactRefSchema.safeParse(proofRef).success) return err<CancellationReceipt>("invalid_request", "quiescence needs a proof artifact");
    this.state = "quiescent";
    this.quiescenceProof = proofRef;
    const receipt: CancellationReceipt = { acknowledgment: "quiescence_proven", quiescent: true, proofRef, cursor: `${this.req!.attemptId}:${this.seq + 1}` };
    this.emit("task.cancel.ack", receipt);
    this.cancellationReceipt = receipt;
    return ok(receipt);
  }

  fence(nextEpoch: number): Result<WorkerSnapshot> {
    if (!this.req) return err("invalid_request", "not started");
    if (!Number.isSafeInteger(nextEpoch) || nextEpoch <= this.epoch) return err("stale_epoch", "fence epoch must increase");
    this.epoch = nextEpoch;
    return ok(this.snapshot());
  }

  checkpoint(ctx: AttemptContext): Result<CheckpointReceipt> {
    const bad = this.check(ctx);
    if (bad) return bad;
    if (this.state !== "quiescent" && this.state !== "blocked") return err("invalid_request", "checkpoint requires proven quiescence");
    if (this.unknownEffects.length) {
      if (this.state !== "blocked") this.emit("task.blocked", { effectIds: [...this.unknownEffects] });
      this.state = "blocked";
      return err("unknown_effect", "unknown effect outcomes block handoff; reconcile in Telar first", {
        unresolvedEffectIds: [...this.unknownEffects],
      });
    }
    return ok({
      checkpointCommit: this.candidate ?? this.req!.originalBaseCommit,
      quiescenceProof: this.quiescenceProof!,
      unresolvedEffectIds: [],
    });
  }

  exportArtifacts(ctx: AttemptContext, expectedCandidate: CommitRef): Result<ExportBundle> {
    const bad = this.check(ctx);
    if (bad) return bad;
    const r = this.req!;
    if (this.unknownEffects.length) {
      return err("unknown_effect", "unknown effects block export", { unresolvedEffectIds: [...this.unknownEffects] });
    }
    if (this.state !== "running" && this.state !== "quiescent") {
      return err<ExportBundle>("policy_denied", `cannot export while ${this.state}`);
    }
    const candidate = r.mode === "independent_review" ? r.candidateToReview! : this.candidate;
    if (!candidate) return err("invalid_request", "no candidate commit recorded");
    if (!sameCommit(candidate, expectedCandidate)) return err("integrity_conflict", "candidate does not match the exact expected commit");
    this.state = "completed";
    this.emit("artifact.exported", { candidateCommit: candidate });
    return ok({
      missionId: r.missionId, attemptId: r.attemptId, taskEpoch: this.epoch, mode: r.mode,
      originalBaseCommit: r.originalBaseCommit, candidateCommit: candidate, spec: r.spec,
      acceptanceCriteria: r.acceptanceCriteria, budgetReservationId: r.budget.reservationId,
      maxCostMicroUsd: r.budget.maxCostMicroUsd, cursor: this.cursor(),
    });
  }

  /** Events strictly after `after`. A cursor older than retention yields gap -> snapshot, never a silent empty list. */
  streamEvents(ctx: AttemptContext, after?: string): Result<WorkerEvent[]> {
    if (!this.req) return err("invalid_request", "not started");
    if (ctx.missionId !== this.req.missionId || ctx.attemptId !== this.req.attemptId) {
      return err("invalid_request", "cursor stream belongs to another attempt");
    }
    let afterSeq = 0;
    if (after !== undefined) {
      const m = /^(.+):(\d+)$/.exec(after);
      if (!m || m[1] !== this.req.attemptId || Number(m[2]) > this.seq) return err("invalid_request", "foreign or unknown cursor");
      afterSeq = Number(m[2]);
    }
    const earliest = this.log[0]?.sequence ?? this.seq + 1;
    if (afterSeq < earliest - 1) {
      const base = { attemptId: this.req.attemptId, taskEpoch: this.epoch, sequence: this.seq, cursor: this.cursor() };
      return ok([
        { ...base, type: "stream.gap", data: { requestedCursor: after ?? "", earliestAvailableCursor: `${this.req.attemptId}:${earliest}`, snapshotRequired: true } },
        { ...base, type: "stream.snapshot", data: this.snapshot() },
      ]);
    }
    return ok(this.log.filter((e) => e.sequence > afterSeq));
  }

  private check(ctx: AttemptContext): Result<never> | undefined {
    if (!this.req) return err("invalid_request", "not started");
    if (ctx.missionId !== this.req.missionId || ctx.attemptId !== this.req.attemptId) {
      return err("invalid_request", "mission/attempt mismatch");
    }
    if (!Number.isSafeInteger(ctx.taskEpoch) || ctx.taskEpoch !== this.epoch) {
      return err("stale_epoch", `epoch ${ctx.taskEpoch} is not current (${this.epoch})`);
    }
    return undefined;
  }

  private cursor() { return `${this.req!.attemptId}:${this.seq}`; }

  private snapshot(): WorkerSnapshot {
    return { attemptId: this.req!.attemptId, taskEpoch: this.epoch, state: this.state, cursor: this.cursor(), blockedEffectIds: [...this.unknownEffects] };
  }

  private emit<K extends keyof EventData>(type: K, data: EventData[K]) {
    this.seq += 1;
    this.log.push({ attemptId: this.req!.attemptId, taskEpoch: this.epoch, sequence: this.seq, cursor: this.cursor(), type, data } as WorkerEvent);
    if (this.log.length > this.retainEvents) this.log.shift();
  }
}

/** Deterministic demo packet. Every ID and hash is an obviously fake fixture value. */
export function demoPilotStartRequest(mode: PilotStartRequest["mode"] = "implementation"): PilotStartRequest {
  const fakeId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const fakeSha = (c: string, len: number) => c.repeat(len);
  const base = { repositoryId: "fixture-repo", sha: fakeSha("b", 40) };
  return {
    missionId: fakeId(1),
    attemptId: fakeId(2),
    taskEpoch: 1,
    mode,
    acceptedPlan: { id: fakeId(3), sha256: fakeSha("a", 64) },
    spec: { id: fakeId(4), sha256: fakeSha("c", 64) },
    acceptanceCriteria: { id: fakeId(5), sha256: fakeSha("d", 64) },
    originalBaseCommit: base,
    ...(mode === "independent_review" ? { candidateToReview: { ...base, sha: fakeSha("e", 40) } } : {}),
    requiredCapabilities: mode === "independent_review"
      ? ["external.read", "test.execute", "review.read_only", "internal.artifact.write"]
      : ["external.read", "internal.artifact.write", "workspace.edit", "test.execute"],
    budget: { reservationId: fakeId(6), maxCostMicroUsd: 5_000_000 },
  };
}
