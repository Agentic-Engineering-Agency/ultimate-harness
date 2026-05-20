/**
 * UH-85 / UH-88 — pure helpers backing the Recent runs pane.
 *
 * The JSX component itself isn't snapshot-tested (too brittle and the
 * plugin's `window.__HERMES_PLUGIN_SDK__` shim isn't available in vitest).
 * Instead we cover the relative-time / duration formatters, the
 * status+search filter, and the multi-column sort comparator so the
 * table semantics are pinned down by tests that survive markup churn.
 */
import { describe, test, expect } from "vitest";
import {
  filterRuns,
  formatDuration,
  formatRelative,
  runArtifactUrl,
  sortRuns,
  type MissionRunSummary,
} from "../apps/hermes-plugin/dashboard/src/recent-runs-utils.js";

const T0 = Date.parse("2026-05-20T12:00:00Z");

function mkRun(over: Partial<MissionRunSummary> = {}): MissionRunSummary {
  return {
    run_id: "run-x",
    started_at: "2026-05-20T12:00:00Z",
    finished_at: "2026-05-20T12:00:05Z",
    status: "passed",
    runtime: "hermes",
    ...over,
  };
}

describe("formatRelative", () => {
  test("same instant -> 0s ago", () => {
    expect(formatRelative(T0, "2026-05-20T12:00:00Z")).toBe("0s ago");
  });
  test("< 60s bucket", () => {
    expect(formatRelative(T0 + 12_000, "2026-05-20T12:00:00Z")).toBe("12s ago");
    expect(formatRelative(T0 + 59_999, "2026-05-20T12:00:00Z")).toBe("59s ago");
  });
  test("< 60m bucket", () => {
    expect(formatRelative(T0 + 60_000, "2026-05-20T12:00:00Z")).toBe("1m ago");
    expect(formatRelative(T0 + 5 * 60_000, "2026-05-20T12:00:00Z")).toBe("5m ago");
  });
  test("< 24h bucket", () => {
    expect(formatRelative(T0 + 2 * 3600_000, "2026-05-20T12:00:00Z")).toBe("2h ago");
    expect(formatRelative(T0 + 23 * 3600_000, "2026-05-20T12:00:00Z")).toBe("23h ago");
  });
  test(">= 24h bucket", () => {
    expect(formatRelative(T0 + 24 * 3600_000, "2026-05-20T12:00:00Z")).toBe("1d ago");
    expect(formatRelative(T0 + 3 * 24 * 3600_000, "2026-05-20T12:00:00Z")).toBe("3d ago");
  });
  test("malformed iso -> em-dash placeholder", () => {
    expect(formatRelative(T0, "not-a-date")).toBe("—");
  });
});

describe("formatDuration", () => {
  test("missing finished_at -> running", () => {
    expect(formatDuration("2026-05-20T12:00:00Z")).toBe("running");
    expect(formatDuration("2026-05-20T12:00:00Z", null)).toBe("running");
  });
  test("< 60s -> Ns", () => {
    expect(formatDuration("2026-05-20T12:00:00Z", "2026-05-20T12:00:05Z")).toBe("5s");
  });
  test("< 60m -> Nm Ss", () => {
    expect(formatDuration("2026-05-20T12:00:00Z", "2026-05-20T12:05:30Z")).toBe("5m 30s");
  });
  test(">= 60m -> Xh Ym", () => {
    expect(formatDuration("2026-05-20T12:00:00Z", "2026-05-20T14:15:00Z")).toBe("2h 15m");
  });
  test("negative duration -> em-dash", () => {
    expect(formatDuration("2026-05-20T12:05:00Z", "2026-05-20T12:00:00Z")).toBe("—");
  });
});

describe("filterRuns", () => {
  const runs: MissionRunSummary[] = [
    mkRun({ run_id: "alpha-1", status: "passed" }),
    mkRun({ run_id: "alpha-2", status: "failed" }),
    mkRun({ run_id: "beta-1", status: "running", finished_at: null }),
    mkRun({ run_id: "beta-2", status: "needs-attention" }),
  ];

  test("empty filter -> all", () => {
    expect(filterRuns(runs, new Set(), "")).toBe(runs);
    expect(filterRuns(runs, new Set(), "  ")).toBe(runs);
  });

  test("status set -> OR semantics", () => {
    const out = filterRuns(runs, new Set(["passed", "failed"]), "");
    expect(out.map((r) => r.run_id)).toEqual(["alpha-1", "alpha-2"]);
  });

  test("search is case-insensitive prefix match", () => {
    expect(filterRuns(runs, new Set(), "AL").map((r) => r.run_id)).toEqual(["alpha-1", "alpha-2"]);
    expect(filterRuns(runs, new Set(), "Beta-").map((r) => r.run_id)).toEqual(["beta-1", "beta-2"]);
    expect(filterRuns(runs, new Set(), "zz")).toEqual([]);
  });

  test("status + search combine (AND across, OR within)", () => {
    const out = filterRuns(runs, new Set(["passed", "running"]), "beta");
    expect(out.map((r) => r.run_id)).toEqual(["beta-1"]);
  });
});

describe("sortRuns", () => {
  const runs: MissionRunSummary[] = [
    mkRun({ run_id: "b", started_at: "2026-05-20T12:00:00Z", finished_at: "2026-05-20T12:00:10Z", status: "failed", runtime: "codex" }),
    mkRun({ run_id: "a", started_at: "2026-05-20T12:05:00Z", finished_at: "2026-05-20T12:06:00Z", status: "passed", runtime: "hermes" }),
    mkRun({ run_id: "c", started_at: "2026-05-20T11:00:00Z", finished_at: "2026-05-20T11:00:05Z", status: "blocked", runtime: "hermes" }),
  ];

  test("started_at desc -> newest first", () => {
    expect(sortRuns(runs, "started_at", "desc").map((r) => r.run_id)).toEqual(["a", "b", "c"]);
  });
  test("started_at asc -> oldest first", () => {
    expect(sortRuns(runs, "started_at", "asc").map((r) => r.run_id)).toEqual(["c", "b", "a"]);
  });
  test("by run_id asc/desc", () => {
    expect(sortRuns(runs, "run_id", "asc").map((r) => r.run_id)).toEqual(["a", "b", "c"]);
    expect(sortRuns(runs, "run_id", "desc").map((r) => r.run_id)).toEqual(["c", "b", "a"]);
  });
  test("by status asc -> lexicographic", () => {
    expect(sortRuns(runs, "status", "asc").map((r) => r.run_id)).toEqual(["c", "b", "a"]);
  });
  test("by duration desc -> longest first; running rows float to top", () => {
    const withRunning = [
      ...runs,
      mkRun({ run_id: "d", started_at: "2026-05-20T12:00:00Z", finished_at: null, status: "running" }),
    ];
    expect(sortRuns(withRunning, "duration", "desc").map((r) => r.run_id)[0]).toBe("d");
  });
  test("stable when key ties", () => {
    const ties: MissionRunSummary[] = [
      mkRun({ run_id: "x", started_at: "2026-05-20T12:00:00Z", status: "passed" }),
      mkRun({ run_id: "y", started_at: "2026-05-20T12:00:00Z", status: "passed" }),
      mkRun({ run_id: "z", started_at: "2026-05-20T12:00:00Z", status: "passed" }),
    ];
    expect(sortRuns(ties, "status", "asc").map((r) => r.run_id)).toEqual(["x", "y", "z"]);
  });
});

describe("runArtifactUrl", () => {
  test("no runId -> mission-latest path", () => {
    expect(runArtifactUrl("M-1", undefined, "prompt")).toBe("/missions/M-1/prompt");
    expect(runArtifactUrl("M-1", undefined, "events")).toBe("/missions/M-1/events");
  });
  test("with runId -> per-run path", () => {
    expect(runArtifactUrl("M-1", "run-abc", "diff")).toBe("/missions/M-1/runs/run-abc/diff");
  });
  test("escapes ids", () => {
    expect(runArtifactUrl("M 1", "run/abc", "final-message")).toBe(
      "/missions/M%201/runs/run%2Fabc/final-message",
    );
  });
});