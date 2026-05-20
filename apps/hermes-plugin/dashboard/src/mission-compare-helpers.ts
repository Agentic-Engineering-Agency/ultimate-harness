/**
 * UH-89 — pure helpers backing the side-by-side compare view.
 *
 * Extracted into a JSX-free module so vitest can import them under
 * `tsconfig.tests.json` without a `window.__HERMES_PLUGIN_SDK__` shim.
 * The `MissionCompare.tsx` component re-exports these so consumers can
 * grab them from either entry point.
 *
 * Both helpers are deliberately small (no diff library, no JSON-patch
 * library) — the bundle budget is 50 KB and the compare panes are the
 * only consumers.
 */

/**
 * Top-level structural diff between two runtime-result documents. Only
 * the FIRST level of keys is compared; nested objects/arrays are
 * compared by deep-equality on their JSON serialization (good enough
 * for runtime-result, which is a flat mapping in practice). Each entry
 * carries both sides' values so the renderer can show them aligned.
 */
export interface RuntimeResultDiffRow {
  key: string;
  aValue: unknown;
  bValue: unknown;
  /** True when the values differ structurally (or one side is missing). */
  differs: boolean;
}

const MISSING = Symbol("missing");

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;
  // Cheap structural equality via canonical JSON. Slow for huge inputs,
  // but runtime-result documents are <10 keys deep in practice.
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

export function runtimeResultDiff(
  a: Record<string, unknown> | null | undefined,
  b: Record<string, unknown> | null | undefined,
): RuntimeResultDiffRow[] {
  const left = a ?? {};
  const right = b ?? {};
  // Stable key order: union of (left, right) preserving left's order
  // first, then right's additions. Operators expect "the keys A had
  // come first" when reading the diff.
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const k of Object.keys(left)) {
    if (!seen.has(k)) { seen.add(k); keys.push(k); }
  }
  for (const k of Object.keys(right)) {
    if (!seen.has(k)) { seen.add(k); keys.push(k); }
  }
  const rows: RuntimeResultDiffRow[] = [];
  for (const key of keys) {
    const hasA = Object.prototype.hasOwnProperty.call(left, key);
    const hasB = Object.prototype.hasOwnProperty.call(right, key);
    const aValue = hasA ? left[key] : MISSING;
    const bValue = hasB ? right[key] : MISSING;
    let differs: boolean;
    if (!hasA || !hasB) {
      differs = true;
    } else {
      differs = !deepEqual(aValue, bValue);
    }
    rows.push({
      key,
      aValue: hasA ? aValue : undefined,
      bValue: hasB ? bValue : undefined,
      differs,
    });
  }
  return rows;
}

/**
 * One line in a unified-style diff. `kind` mirrors the visible prefix
 * (`+` / `-` / ` `). The renderer paints `add` rows green, `del` red,
 * and `eq` neutral.
 */
export type LineDiffOp = { kind: "eq" | "add" | "del"; text: string };

/**
 * LCS-based line diff. O(n*m) memory which is fine for prompts under a
 * few thousand lines. We never add a third-party diff library — the
 * 50 KB bundle budget would not survive `diff` (~30 KB minified).
 *
 * The output is the "unified" walk: shared lines appear once with the
 * `eq` tag, removals from `a` appear before the corresponding
 * additions from `b` for the same LCS segment.
 */
export function lineDiff(a: string, b: string): LineDiffOp[] {
  const aLines = a === "" ? [] : a.split("\n");
  const bLines = b === "" ? [] : b.split("\n");
  const n = aLines.length;
  const m = bLines.length;
  if (n === 0 && m === 0) return [];
  if (n === 0) return bLines.map((t) => ({ kind: "add" as const, text: t }));
  if (m === 0) return aLines.map((t) => ({ kind: "del" as const, text: t }));
  // Build an (n+1) x (m+1) LCS length table. Flat array for cache
  // locality; row-major: dp[i*(m+1) + j].
  const stride = m + 1;
  const dp = new Int32Array((n + 1) * stride);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      const here = i * stride + j;
      if (aLines[i] === bLines[j]) {
        dp[here] = dp[(i + 1) * stride + (j + 1)] + 1;
      } else {
        const down = dp[(i + 1) * stride + j];
        const right = dp[i * stride + (j + 1)];
        dp[here] = down >= right ? down : right;
      }
    }
  }
  // Walk the table to emit ops.
  const ops: LineDiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (aLines[i] === bLines[j]) {
      ops.push({ kind: "eq", text: aLines[i] });
      i++; j++;
    } else if (dp[(i + 1) * stride + j] >= dp[i * stride + (j + 1)]) {
      ops.push({ kind: "del", text: aLines[i] });
      i++;
    } else {
      ops.push({ kind: "add", text: bLines[j] });
      j++;
    }
  }
  while (i < n) { ops.push({ kind: "del", text: aLines[i++] }); }
  while (j < m) { ops.push({ kind: "add", text: bLines[j++] }); }
  return ops;
}

/**
 * UH-87 — pure helpers backing the Run modal's replay mode. The modal
 * renders these via `RunModal.tsx` but they live here so vitest can
 * pin their behaviour without mounting React.
 */
export function runModalTitle(missionId: string, replayOf: string | undefined): string {
  if (replayOf) return `Replay ${missionId}`;
  return `Run ${missionId}`;
}

export function replayBannerText(replayOf: string | undefined): string | null {
  if (!replayOf) return null;
  const short = replayOf.length > 16 ? `${replayOf.slice(0, 16)}…` : replayOf;
  return `Replaying run ${short}`;
}