/**
 * UH-77 drift detection and idempotent repair types.
 *
 * A "drift" is a difference between what `.harness/` records and what the
 * filesystem actually contains. A repair is an idempotent operation that
 * either reconciles the drift or yields control back to a human.
 */

export type DriftKind =
  | "stale-worker"
  | "orphaned-worktree"
  | "orphaned-run-dir"
  | "roadmap-linear-divergence"
  | "missing-completion-timestamp"
  | "truncated-events-ndjson"
  | "stale-render";

export type DriftSeverity = "warn" | "error";

export interface DriftIssue {
  kind: DriftKind;
  severity: DriftSeverity;
  /** Human-readable message. */
  message: string;
  /** Filesystem path the drift relates to (mission dir, worktree dir, etc.). */
  target: string;
  /** Structured payload used by `repair` to act precisely. */
  metadata?: Record<string, string>;
}

export type RepairOutcome = "repaired" | "skipped" | "failed" | "needs-human";

export interface RepairResult {
  issue: DriftIssue;
  outcome: RepairOutcome;
  /** Human-readable reason; required for `failed` and `needs-human`. */
  reason?: string;
}

export interface DriftKindModule {
  kind: DriftKind;
  /** Whether `repair` can ever mutate the filesystem (false → warn-only). */
  canRepair: boolean;
  detect(root: string): Promise<DriftIssue[]>;
  repair(issue: DriftIssue, root: string): Promise<RepairResult>;
}
