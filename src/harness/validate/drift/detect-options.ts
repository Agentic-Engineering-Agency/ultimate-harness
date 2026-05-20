/**
 * Options threaded through drift detectors (UH-109+).
 */
export type DriftDetectOptions = {
  /** When true, `spec-stale` issues use severity `error` instead of `warn`. */
  strictSpec?: boolean;
};
