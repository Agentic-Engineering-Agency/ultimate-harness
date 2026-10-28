import { describe, expect, test } from "vitest";
import {
  demoPilotStartRequest,
  FakePilotWorker,
  type AttemptContext,
  type Result,
} from "../src/harness/proactive-pilot/worker.js";

const proof = { id: "00000000-0000-4000-8000-0000000000aa", sha256: "9".repeat(64) };
const ctxOf = (r = demoPilotStartRequest()): AttemptContext => ({ missionId: r.missionId, attemptId: r.attemptId, taskEpoch: r.taskEpoch });
const failure = <T>(r: Result<T>) => {
  if (r.ok) throw new Error("expected failure");
  return r.error;
};
const started = (mode: "implementation" | "independent_review" = "implementation", retain?: number) => {
  const w = new FakePilotWorker(undefined, retain);
  const req = demoPilotStartRequest(mode);
  expect(w.start(req).ok).toBe(true);
  return { w, req, ctx: ctxOf(req) };
};

describe("FakePilotWorker start packet", () => {
  test("binds mission/attempt/epoch and exact refs", () => {
    const { w, ctx } = started();
    expect(w.streamEvents(ctx).ok).toBe(true);
    expect(failure(w.cancel({ ...ctx, attemptId: "00000000-0000-4000-8000-0000000000ff" }, "x")).code).toBe("invalid_request");
  });

  test.each([
    ["abbreviated base commit", (r: any) => { r.originalBaseCommit.sha = "bbbbbbb"; }],
    ["malformed spec hash", (r: any) => { r.spec.sha256 = "C".repeat(64); }],
    ["fractional microUSD", (r: any) => { r.budget.maxCostMicroUsd = 1.5; }],
    ["unsafe microUSD", (r: any) => { r.budget.maxCostMicroUsd = 2 ** 53; }],
    ["unknown field", (r: any) => { r.shell = "bash"; }],
    ["zero epoch", (r: any) => { r.taskEpoch = 0; }],
    ["review candidate in implementation mode", (r: any) => { r.candidateToReview = r.originalBaseCommit; }],
  ])("rejects %s", (_n, mutate) => {
    const req = demoPilotStartRequest();
    mutate(req);
    expect(failure(new FakePilotWorker().start(req)).code).toBe("invalid_request");
  });

  test("missing adapter capabilities fail loudly with the list", () => {
    const err = failure(new FakePilotWorker(["external.read", "internal.artifact.write"]).start(demoPilotStartRequest()));
    expect(err.code).toBe("unsupported_capability");
    expect(err.missingCapabilities).toEqual(["workspace.edit", "test.execute"]);
  });

  test("external mutation capabilities are denied at start and at use", () => {
    const req = demoPilotStartRequest();
    req.requiredCapabilities.push("git.push");
    expect(failure(new FakePilotWorker().start(req)).code).toBe("policy_denied");
    const { w, ctx } = started();
    for (const capability of ["email.send", "crm.write", "git.merge", "deploy", "private.preview"]) {
      expect(failure(w.perform(ctx, { effectId: "e", capability, outcome: "committed" })).code).toBe("policy_denied");
    }
  });
});

describe("FakePilotWorker lifecycle", () => {
  test("stale epochs are rejected after UH fences", () => {
    const { w, ctx } = started();
    expect(w.fence(2).ok).toBe(true);
    expect(failure(w.cancel(ctx, "old")).code).toBe("stale_epoch");
    expect(failure(w.fence(2)).code).toBe("stale_epoch");
    expect(w.cancel({ ...ctx, taskEpoch: 2 }, "current").ok).toBe(true);
  });

  test("cancellation request is not quiescence; checkpoint needs proof", () => {
    const { w, ctx } = started();
    const ack = w.cancel(ctx, "operator");
    expect(ack.ok && ack.value).toMatchObject({ acknowledgment: "request_recorded", quiescent: false });
    expect(failure(w.checkpoint(ctx)).message).toContain("quiescence");
    expect(failure(w.perform(ctx, { effectId: "e", capability: "workspace.edit", outcome: "committed" })).code).toBe("policy_denied");
    const q = w.proveQuiescence(ctx, proof);
    expect(q.ok && q.value).toMatchObject({ acknowledgment: "quiescence_proven", quiescent: true, proofRef: proof });
    expect(w.checkpoint(ctx).ok).toBe(true);
  });

  test("unknown effect outcome blocks handoff and export", () => {
    const { w, ctx, req } = started();
    expect(w.perform(ctx, { effectId: "fx-1", capability: "test.execute", outcome: "unknown" }).ok).toBe(true);
    expect(w.recordCandidate(ctx, { ...req.originalBaseCommit, sha: "c".repeat(40) }).ok).toBe(true);
    expect(failure(w.exportArtifacts(ctx, { ...req.originalBaseCommit, sha: "c".repeat(40) })).code).toBe("unknown_effect");
    w.cancel(ctx, "handoff");
    w.proveQuiescence(ctx, proof);
    const err = failure(w.checkpoint(ctx));
    expect(err).toMatchObject({ code: "unknown_effect", unresolvedEffectIds: ["fx-1"] });
    const events = w.streamEvents(ctx);
    expect(events.ok && events.value.at(-1)?.type).toBe("task.blocked");
  });

  test("export binds the exact candidate commit", () => {
    const { w, ctx, req } = started();
    const candidate = { ...req.originalBaseCommit, sha: "c".repeat(40) };
    expect(failure(w.recordCandidate(ctx, { ...candidate, sha: "ccccccc" })).code).toBe("invalid_request");
    w.recordCandidate(ctx, candidate);
    expect(failure(w.exportArtifacts(ctx, { ...candidate, sha: "d".repeat(40) })).code).toBe("integrity_conflict");
    const ex = w.exportArtifacts(ctx, candidate);
    expect(ex.ok && ex.value).toMatchObject({ originalBaseCommit: req.originalBaseCommit, candidateCommit: candidate, spec: req.spec, maxCostMicroUsd: 5_000_000 });
  });

  test("independent reviewer is read-only and reviews only the exact candidate", () => {
    const bad = demoPilotStartRequest("independent_review");
    bad.requiredCapabilities.push("workspace.edit");
    expect(failure(new FakePilotWorker().start(bad)).code).toBe("policy_denied");
    expect(failure(new FakePilotWorker().start({ ...demoPilotStartRequest("independent_review"), candidateToReview: undefined })).code)
      .toBe("invalid_request");

    const { w, ctx, req } = started("independent_review");
    expect(failure(w.perform(ctx, { effectId: "e", capability: "workspace.edit", outcome: "committed" })).code).toBe("policy_denied");
    expect(failure(w.recordCandidate(ctx, req.candidateToReview!)).code).toBe("policy_denied");
    expect(failure(w.exportArtifacts(ctx, { ...req.candidateToReview!, sha: "f".repeat(40) })).code).toBe("integrity_conflict");
    const ex = w.exportArtifacts(ctx, req.candidateToReview!);
    expect(ex.ok && ex.value.candidateCommit).toEqual(req.candidateToReview);
  });
});

describe("FakePilotWorker cursor replay", () => {
  test("returns events strictly after a cursor", () => {
    const { w, ctx } = started();
    w.cancel(ctx, "a");
    const all = w.streamEvents(ctx);
    if (!all.ok) throw new Error();
    expect(all.value.map((e) => e.type)).toEqual(["task.started", "task.cancel.requested", "task.cancel.ack"]);
    const after = w.streamEvents(ctx, all.value[0]!.cursor);
    expect(after.ok && after.value.map((e) => e.sequence)).toEqual([2, 3]);
  });

  test("stale cursor yields gap then snapshot barrier, never an empty stream", () => {
    const { w, ctx, req } = started("implementation", 2);
    w.cancel(ctx, "a");
    w.proveQuiescence(ctx, proof); // seq 4; retained 3..4
    const r = w.streamEvents(ctx, `${req.attemptId}:1`);
    if (!r.ok) throw new Error();
    expect(r.value.map((e) => e.type)).toEqual(["stream.gap", "stream.snapshot"]);
    expect(r.value[1]).toMatchObject({ cursor: `${req.attemptId}:4`, data: { state: "quiescent" } });
    // Resuming from the snapshot cursor is contiguous.
    const next = w.streamEvents(ctx, r.value[1]!.cursor);
    expect(next.ok && next.value).toEqual([]);
    // A cursor at the retention edge is not a gap.
    const edge = w.streamEvents(ctx, `${req.attemptId}:2`);
    expect(edge.ok && edge.value.map((e) => e.sequence)).toEqual([3, 4]);
  });

  test("rejects foreign or future cursors", () => {
    const { w, ctx } = started();
    expect(failure(w.streamEvents(ctx, "00000000-0000-4000-8000-0000000000ff:1")).code).toBe("invalid_request");
    expect(failure(w.streamEvents(ctx, `${ctx.attemptId}:99`)).code).toBe("invalid_request");
  });
});
