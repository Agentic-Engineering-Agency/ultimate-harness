type Event = Record<string, unknown>;

const record = (value: unknown): Event | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Event : undefined;

/** A Command Code shell result that carries no error field opens with this line. */
const EXIT_CODE_LINE = /^Exit code:[ \t]*(-?\d+)[ \t]*(?:\r?\n|$)/;

export interface NativeToolFailure {
  failed: boolean;
  exit_code?: number;
  /** Where the verdict came from: a structured field, the result text, or nothing. */
  source: "field" | "text" | "none";
}

/**
 * Whether a native tool-completion event reports a failure, across runtime
 * families. Structured error and exit fields decide when a runtime provides
 * them (oh-my-pi, Claude-derived events); otherwise a leading
 * `Exit code: <n>` line in Command Code text result blocks decides, where a
 * non-zero n is a failure. Unknown shapes are not failures.
 */
export function nativeToolFailure(event: Event): NativeToolFailure {
  const result = record(event.result);
  const exitCode = typeof result?.exitCode === "number" ? result.exitCode
    : typeof result?.exit_code === "number" ? result.exit_code
    : undefined;
  if (typeof event.isError === "boolean" || typeof result?.isError === "boolean" ||
    typeof result?.is_error === "boolean" || exitCode !== undefined) {
    const failed = event.isError === true || result?.isError === true || result?.is_error === true ||
      (exitCode !== undefined && exitCode !== 0);
    return { failed, ...(exitCode === undefined ? {} : { exit_code: exitCode }), source: "field" };
  }
  for (const block of Array.isArray(event.result) ? event.result : []) {
    const text = record(block)?.text;
    if (typeof text !== "string") continue;
    const match = EXIT_CODE_LINE.exec(text.replace(/^[ \t]+/, ""));
    if (!match) continue;
    const code = Number(match[1]);
    return { failed: code !== 0, exit_code: code, source: "text" };
  }
  return { failed: false, source: "none" };
}
