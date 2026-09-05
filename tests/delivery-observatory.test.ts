import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import { projectDeliveryObservatory } from "../src/harness/delivery-observatory/project.js";
import { validateDeliveryObservatorySnapshot } from "../src/schema/delivery-observatory.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "uh-observatory-"));
  roots.push(root);
  const mission = path.join(root, ".harness", "missions", "work-one");
  await mkdir(path.join(mission, "runs"), { recursive: true });
  await writeFile(path.join(root, ".harness", "project.yaml"), [
    "schema_version: uh.project.v0", "id: project-one", "name: Safe project", `root_path: ${root}`,
    "created_at: 2026-08-23T12:00:00Z", "issue_sources: []", "default_workflow_profiles: []",
  ].join("\n"));
  await writeFile(path.join(mission, "mission.yaml"), [
    "schema_version: uh.mission.v0", "id: work-one", "name: Release readiness",
    "workflow_profile: staged", "description: private conversation body", "read_first:",
    `  - ${root}/PRIVATE.md`, "expected_artifacts:", `  - path: ${root}/secret.txt`,
    "verification:", "  checks: []", "  review_gates:", "    - private-approval-copy",
  ].join("\n"));
  await writeFile(path.join(mission, "runtime-result.yaml"), [
    "schema_version: uh.runtime-result.v0", "mission_id: work-one", "runtime: codex", "status: blocked",
    "started_at: 2026-08-23T12:00:00Z", "finished_at: 2026-08-23T12:00:30Z",
    `prompt_path: ${root}/prompt.md`, `stdout_path: ${root}/stdout.log`, `stderr_path: ${root}/stderr.log`,
    "errors:", "  - private raw failure payload",
  ].join("\n"));
  await writeFile(path.join(mission, "runs", "index.json"), JSON.stringify({
    schema_version: "uh.runs-index.v0",
    runs: [{ run_id: "run-one", started_at: "2026-08-23T12:00:00Z", finished_at: "2026-08-23T12:00:30Z", status: "blocked", runtime: "codex" }],
  }));
  return root;
}

describe("Delivery Observatory projector", () => {
  it("emits a strict safe snapshot with explicit unknown route and usage facts", async () => {
    const root = await fixture();
    const snapshot = await projectDeliveryObservatory(root, { now: "2026-08-23T12:01:00Z" });
    expect(() => validateDeliveryObservatorySnapshot(snapshot)).not.toThrow();
    expect(snapshot.contract_version).toBe("delivery-observatory.v1");
    expect(snapshot.sources[0]?.transport).toBe("filesystem");
    expect(snapshot.sources[0]?.coverage).toBe("partial");
    expect(snapshot.work_items[0]).toMatchObject({
      safe_title: "Release readiness",
      operation: "blocked",
      phase: "review",
      requested_model: { state: "unknown", reason_code: "not_reported" },
      resolved_model: { state: "unknown", reason_code: "not_reported" },
      adapter: { state: "known", value: "codex" },
    });
    expect(snapshot.decisions[0]).toMatchObject({
      kind: "human_gate",
      authority_href: null,
      state: "awaiting_answer",
    });
    expect(snapshot.redaction.fields_omitted).toBeGreaterThan(0);
  });

  it("never serializes private bodies, personal paths, prompts, logs, or arbitrary gate copy", async () => {
    const root = await fixture();
    const serialized = JSON.stringify(await projectDeliveryObservatory(root, { now: "2026-08-23T12:01:00Z" }));
    for (const forbidden of [
      root,
      "private conversation body",
      "PRIVATE.md",
      "secret.txt",
      "prompt.md",
      "stdout.log",
      "stderr.log",
      "private raw failure payload",
      "private-approval-copy",
    ]) expect(serialized).not.toContain(forbidden);
  });

  it("projects conservative native route identifiers and withholds unsafe metadata", async () => {
    const root = await fixture();
    const runtimePath = path.join(root, ".harness", "missions", "work-one", "runtime-result.yaml");
    const base = [
      "schema_version: uh.runtime-result.v0", "mission_id: work-one", "runtime: openrouter", "status: passed",
      "started_at: 2026-08-23T12:00:00Z", "finished_at: 2026-08-23T12:00:30Z",
      `prompt_path: ${root}/prompt.md`, `stdout_path: ${root}/stdout.log`, `stderr_path: ${root}/stderr.log`,
    ];
    await writeFile(runtimePath, [...base, "provider: openrouter", "model: openai/gpt-4o-mini"].join("\n"));
    const safe = await projectDeliveryObservatory(root, { now: "2026-08-23T12:01:00Z" });
    expect(safe.work_items[0]?.resolved_model).toMatchObject({ state: "known", value: "openai/gpt-4o-mini" });
    expect(safe.work_items[0]?.provider).toMatchObject({ state: "known", value: "openrouter" });

    await writeFile(runtimePath, [...base, "provider: Bearer sk-live-secret", "model: C:/Users/example/private/prompt.json"].join("\n"));
    const unsafe = await projectDeliveryObservatory(root, { now: "2026-08-23T12:01:00Z" });
    expect(unsafe.work_items[0]?.resolved_model).toMatchObject({ state: "unknown", reason_code: "unauthorized" });
    expect(unsafe.work_items[0]?.provider).toMatchObject({ state: "unknown", reason_code: "unauthorized" });
    const serialized = JSON.stringify(unsafe);
    expect(serialized).not.toContain("sk-live-secret");
    expect(serialized).not.toContain("C:/Users/example/private/prompt.json");
  });

  it("uses honest empty and unknown states when the project has no runs", async () => {
    const root = await fixture();
    await rm(path.join(root, ".harness", "missions", "work-one", "runtime-result.yaml"));
    await rm(path.join(root, ".harness", "missions", "work-one", "runs", "index.json"));
    const snapshot = await projectDeliveryObservatory(root, { now: "2026-08-23T12:01:00Z" });
    expect(snapshot.work_items[0]?.operation).toBe("queued");
    expect(snapshot.work_items[0]?.elapsed_ms).toBeNull();
    expect(snapshot.metrics.every((metric) => metric.value.state === "unknown")).toBe(true);
  });

  it("rejects corrupt artifacts instead of reporting them as merely absent", async () => {
    const root = await fixture();
    await writeFile(path.join(root, ".harness", "missions", "work-one", "runs", "index.json"), "{not-json");
    const snapshot = await projectDeliveryObservatory(root, { now: "2026-08-23T12:01:00Z" });
    expect(snapshot.redaction.records_rejected).toBe(1);
    expect(snapshot.sources[0]?.rejected_records).toBe(1);
    expect(snapshot.work_items[0]?.operation).toBe("blocked");
  });
});
