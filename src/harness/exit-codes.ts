export const EXIT_CODE_PASSED = 0;
export const EXIT_CODE_FAILED = 1;
export const EXIT_CODE_BLOCKED = 2;
export const EXIT_CODE_CANCELLED = 130;
export const EXIT_CODE_SIGNAL = 143;

/**
 * Pure mapping from run settlement status and stop code to process exit code.
 *
 * Contract:
 * - 0: passed
 * - 1: failed (default for non-passing outcomes)
 * - 2: blocked (including preflight and fleet refusals)
 * - 130: cancelled
 * - 143: reserved for SIGINT/SIGTERM termination
 */
export function exitCodeForRun(
  status?: string | null,
  stopCode?: string | null,
): number {
  if (status === "cancelled" || stopCode === "cancelled") {
    return EXIT_CODE_CANCELLED;
  }
  if (status === "blocked" || stopCode === "blocked") {
    return EXIT_CODE_BLOCKED;
  }
  if (status === "passed") {
    return EXIT_CODE_PASSED;
  }
  return EXIT_CODE_FAILED;
}
