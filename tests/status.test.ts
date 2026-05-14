import { test, expect, describe } from "vitest";
import { mkdir, rm, writeFile, access, readdir } from "node:fs/promises";
import { join } from "node:path";
import { getStatus } from "../src/harness/status.js";
import { initializeHarness } from "../src/harness/init.js";

const TEST_ROOT = "/tmp/uh-test-status";

async function cleanup() {
  try { await rm(TEST_ROOT, { recursive: true, force: true }); } catch {}
}

test.beforeEach(cleanup);
test.afterEach(cleanup);

describe("uh status", () => {
  test("fails clearly outside a harness project", async () => {
    await mkdir(TEST_ROOT, { recursive: true });
    await expect(getStatus(TEST_ROOT)).rejects.toThrow("Not a Ultimate Harness project");
  });

  test("reports initialized project correctly", async () => {
    await mkdir(TEST_ROOT, { recursive: true });
    await initializeHarness(TEST_ROOT);
    const s = await getStatus(TEST_ROOT);
    expect(s.name).toBeTruthy();
    expect(s.schema_version).toBe("uh.project.v0");
    expect(s.adapters.length).toBe(0);
    expect(s.active_missions_count).toBe(0);
    expect(s.skills_indexed_count).toBe(0);
    expect(s.sandboxes.total).toBe(0);
    expect(s.verified_missions_count).toBe(0);
    expect(s.promoted_missions_count).toBe(0);
  });

  test("counts workflow profiles", async () => {
    await mkdir(TEST_ROOT, { recursive: true });
    await initializeHarness(TEST_ROOT);
    const s = await getStatus(TEST_ROOT);
    expect(s.workflow_profiles_count).toBe(5);
  });

  test("counts adapters", async () => {
    await mkdir(TEST_ROOT, { recursive: true });
    await initializeHarness(TEST_ROOT);
    await writeFile(
      join(TEST_ROOT, ".harness", "adapters", "hermes.yaml"),
      "schema_version: uh.adapter.v0\nid: hermes\nname: Hermes\nruntime: hermes\n",
      "utf-8"
    );
    const s = await getStatus(TEST_ROOT);
    expect(s.adapters.length).toBe(1);
    expect(s.adapters[0].id).toBe("hermes");
  });

  test("counts active missions", async () => {
    await mkdir(TEST_ROOT, { recursive: true });
    await initializeHarness(TEST_ROOT);
    await mkdir(join(TEST_ROOT, ".harness", "missions", "test-mission"), { recursive: true });
    await writeFile(
      join(TEST_ROOT, ".harness", "missions", "test-mission", "mission.yaml"),
      "schema_version: uh.mission.v0\nid: test\nname: Test\nworkflow_profile: research-docs\n",
      "utf-8"
    );
    const s = await getStatus(TEST_ROOT);
    expect(s.active_missions_count).toBe(1);
  });

  test("counts recent audit events", async () => {
    await mkdir(TEST_ROOT, { recursive: true });
    await initializeHarness(TEST_ROOT);
    const s = await getStatus(TEST_ROOT);
    expect(s.recent_audit_events).toBe(1); // init event
  });

  test("counts skills, sandbox statuses, and verified/promoted mission artifacts", async () => {
    await mkdir(TEST_ROOT, { recursive: true });
    await initializeHarness(TEST_ROOT);
    await writeFile(
      join(TEST_ROOT, ".harness", "skills", "index.yaml"),
      `schema_version: uh.skills-index.v0
skills:
  - name: code-review
  - name: test-authoring
`,
      "utf-8"
    );
    await writeFile(
      join(TEST_ROOT, ".harness", "sandboxes", "index.yaml"),
      `schema_version: uh.sandboxes-index.v0
sandboxes:
  - id: sandbox-1
    mission_id: mission-1
    backend: git-worktree
    status: running
  - id: sandbox-2
    mission_id: mission-2
    backend: git-worktree
    status: verified
  - id: sandbox-3
    mission_id: mission-3
    backend: git-worktree
    status: promoted
`,
      "utf-8"
    );
    await mkdir(join(TEST_ROOT, ".harness", "missions", "mission-1"), { recursive: true });
    await mkdir(join(TEST_ROOT, ".harness", "missions", "mission-2"), { recursive: true });
    await writeFile(
      join(TEST_ROOT, ".harness", "missions", "mission-1", "mission.yaml"),
      "schema_version: uh.mission.v0\nid: mission-1\nname: Mission 1\nworkflow_profile: research-docs\n",
      "utf-8"
    );
    await writeFile(
      join(TEST_ROOT, ".harness", "missions", "mission-2", "mission.yaml"),
      "schema_version: uh.mission.v0\nid: mission-2\nname: Mission 2\nworkflow_profile: research-docs\n",
      "utf-8"
    );
    await writeFile(
      join(TEST_ROOT, ".harness", "missions", "mission-1", "verification.yaml"),
      "schema_version: uh.verification-result.v0\nmission_id: mission-1\nstatus: passed\nchecks: []\n",
      "utf-8"
    );
    await writeFile(
      join(TEST_ROOT, ".harness", "missions", "mission-2", "verification.yaml"),
      "schema_version: uh.verification-result.v0\nmission_id: mission-2\nstatus: passed\nchecks: []\n",
      "utf-8"
    );
    await writeFile(
      join(TEST_ROOT, ".harness", "missions", "mission-2", "promotion.yaml"),
      "schema_version: uh.promotion.v0\nmission_id: mission-2\ndecision: promoted\n",
      "utf-8"
    );

    const s = await getStatus(TEST_ROOT);

    expect(s.skills_indexed_count).toBe(2);
    expect(s.sandboxes).toEqual({
      total: 3,
      by_status: {
        created: 0,
        running: 1,
        dirty: 0,
        verified: 1,
        promoted: 1,
        discarded: 0,
      },
    });
    expect(s.verified_missions_count).toBe(2);
    expect(s.promoted_missions_count).toBe(1);
  });

  test("counts only passed verification results for real mission dirs", async () => {
    await mkdir(TEST_ROOT, { recursive: true });
    await initializeHarness(TEST_ROOT);

    for (const mission of ["passed", "failed", "malformed", "artifact-only"]) {
      await mkdir(join(TEST_ROOT, ".harness", "missions", mission), { recursive: true });
    }
    for (const mission of ["passed", "failed", "malformed"]) {
      await writeFile(
        join(TEST_ROOT, ".harness", "missions", mission, "mission.yaml"),
        `schema_version: uh.mission.v0\nid: ${mission}\nname: ${mission}\nworkflow_profile: research-docs\n`,
        "utf-8"
      );
    }

    await writeFile(
      join(TEST_ROOT, ".harness", "missions", "passed", "verification.yaml"),
      "schema_version: uh.verification-result.v0\nmission_id: passed\nstatus: passed\nchecks: []\n",
      "utf-8"
    );
    await writeFile(
      join(TEST_ROOT, ".harness", "missions", "failed", "verification.yaml"),
      "schema_version: uh.verification-result.v0\nmission_id: failed\nstatus: failed\nchecks: []\n",
      "utf-8"
    );
    await writeFile(
      join(TEST_ROOT, ".harness", "missions", "malformed", "verification.yaml"),
      "schema_version: uh.verification-result.v0\nmission_id: malformed\nstatus: maybe\nchecks: []\n",
      "utf-8"
    );
    await writeFile(
      join(TEST_ROOT, ".harness", "missions", "artifact-only", "verification.yaml"),
      "schema_version: uh.verification-result.v0\nmission_id: artifact-only\nstatus: passed\nchecks: []\n",
      "utf-8"
    );

    const s = await getStatus(TEST_ROOT);
    expect(s.verified_missions_count).toBe(1);
  });

  test("counts only promoted promotion results for real mission dirs", async () => {
    await mkdir(TEST_ROOT, { recursive: true });
    await initializeHarness(TEST_ROOT);

    for (const mission of ["promoted", "rejected", "malformed", "artifact-only"]) {
      await mkdir(join(TEST_ROOT, ".harness", "missions", mission), { recursive: true });
    }
    for (const mission of ["promoted", "rejected", "malformed"]) {
      await writeFile(
        join(TEST_ROOT, ".harness", "missions", mission, "mission.yaml"),
        `schema_version: uh.mission.v0\nid: ${mission}\nname: ${mission}\nworkflow_profile: research-docs\n`,
        "utf-8"
      );
    }

    await writeFile(
      join(TEST_ROOT, ".harness", "missions", "promoted", "promotion.yaml"),
      "schema_version: uh.promotion.v0\nmission_id: promoted\ndecision: promoted\n",
      "utf-8"
    );
    await writeFile(
      join(TEST_ROOT, ".harness", "missions", "rejected", "promotion.yaml"),
      "schema_version: uh.promotion.v0\nmission_id: rejected\ndecision: rejected\n",
      "utf-8"
    );
    await writeFile(
      join(TEST_ROOT, ".harness", "missions", "malformed", "promotion.yaml"),
      "schema_version: uh.promotion.v0\nmission_id: malformed\ndecision: maybe\n",
      "utf-8"
    );
    await writeFile(
      join(TEST_ROOT, ".harness", "missions", "artifact-only", "promotion.yaml"),
      "schema_version: uh.promotion.v0\nmission_id: artifact-only\ndecision: promoted\n",
      "utf-8"
    );

    const s = await getStatus(TEST_ROOT);
    expect(s.promoted_missions_count).toBe(1);
  });

  test("does not count promoted promotion result from a different mission id", async () => {
    await mkdir(TEST_ROOT, { recursive: true });
    await initializeHarness(TEST_ROOT);
    await mkdir(join(TEST_ROOT, ".harness", "missions", "a"), { recursive: true });
    await writeFile(
      join(TEST_ROOT, ".harness", "missions", "a", "mission.yaml"),
      "schema_version: uh.mission.v0\nid: a\nname: Mission A\nworkflow_profile: research-docs\n",
      "utf-8"
    );
    await writeFile(
      join(TEST_ROOT, ".harness", "missions", "a", "promotion.yaml"),
      "schema_version: uh.promotion.v0\nmission_id: b\ndecision: promoted\n",
      "utf-8"
    );

    const s = await getStatus(TEST_ROOT);
    expect(s.promoted_missions_count).toBe(0);
  });

  test("does not count passed verification result from a different mission id", async () => {
    await mkdir(TEST_ROOT, { recursive: true });
    await initializeHarness(TEST_ROOT);
    await mkdir(join(TEST_ROOT, ".harness", "missions", "a"), { recursive: true });
    await writeFile(
      join(TEST_ROOT, ".harness", "missions", "a", "mission.yaml"),
      "schema_version: uh.mission.v0\nid: a\nname: Mission A\nworkflow_profile: research-docs\n",
      "utf-8"
    );
    await writeFile(
      join(TEST_ROOT, ".harness", "missions", "a", "verification.yaml"),
      "schema_version: uh.verification-result.v0\nmission_id: b\nstatus: passed\nchecks: []\n",
      "utf-8"
    );

    const s = await getStatus(TEST_ROOT);
    expect(s.verified_missions_count).toBe(0);
  });

  test("does not count passed verification result when mission id does not match directory", async () => {
    await mkdir(TEST_ROOT, { recursive: true });
    await initializeHarness(TEST_ROOT);
    await mkdir(join(TEST_ROOT, ".harness", "missions", "b"), { recursive: true });
    await writeFile(
      join(TEST_ROOT, ".harness", "missions", "b", "mission.yaml"),
      "schema_version: uh.mission.v0\nid: a\nname: Mission A\nworkflow_profile: research-docs\n",
      "utf-8"
    );
    await writeFile(
      join(TEST_ROOT, ".harness", "missions", "b", "verification.yaml"),
      "schema_version: uh.verification-result.v0\nmission_id: b\nstatus: passed\nchecks: []\n",
      "utf-8"
    );

    const s = await getStatus(TEST_ROOT);
    expect(s.verified_missions_count).toBe(0);
  });

  test("does not count promoted promotion result when mission id does not match directory", async () => {
    await mkdir(TEST_ROOT, { recursive: true });
    await initializeHarness(TEST_ROOT);
    await mkdir(join(TEST_ROOT, ".harness", "missions", "b"), { recursive: true });
    await writeFile(
      join(TEST_ROOT, ".harness", "missions", "b", "mission.yaml"),
      "schema_version: uh.mission.v0\nid: a\nname: Mission A\nworkflow_profile: research-docs\n",
      "utf-8"
    );
    await writeFile(
      join(TEST_ROOT, ".harness", "missions", "b", "promotion.yaml"),
      "schema_version: uh.promotion.v0\nmission_id: b\ndecision: promoted\n",
      "utf-8"
    );

    const s = await getStatus(TEST_ROOT);
    expect(s.promoted_missions_count).toBe(0);
  });
});
