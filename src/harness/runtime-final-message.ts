/**
 * Runtime-final-message capture protocol (UH-28).
 *
 * Every runtime adapter participates in a uniform protocol for capturing
 * a mission's final summary message:
 *
 *   1. The harness appends a sentinel instruction to the mission prompt
 *      (`runtimeFinalMessageInstruction`) asking the model to terminate
 *      its response with a fenced code block tagged `uh-runtime-final-message`.
 *   2. Each adapter scans the captured output (model's final-message
 *      file, NDJSON stream, stdout) with `extractRuntimeFinalMessageSentinel`
 *      and uses the sentinel content when present; otherwise falls back
 *      to its runtime-native capture (Codex's `--output-last-message`,
 *      oh-my-pi's heuristic, Hermes' structured block).
 *
 * The protocol is intentionally additive: a runtime that hasn't been
 * prompted with the sentinel instruction still works, just with the
 * pre-UH-28 fallback path.
 */

/**
 * Fence tag the model is instructed to emit. The harness extracts the
 * inner content into `runtime-final.txt`.
 */
export const RUNTIME_FINAL_MESSAGE_TAG = "uh-runtime-final-message";

/**
 * Instruction block to append to a mission prompt. Asks the model to
 * terminate its response with a sentinel fenced block. Idempotent for
 * the prompt builder — every adapter calls this exactly once at the end
 * of prompt construction.
 *
 * Markdown-flavored so it renders the same for any backend that surfaces
 * the prompt to the user (most coding agent runtimes do).
 */
export function runtimeFinalMessageInstruction(): string {
  return [
    "",
    "## Runtime final message",
    "",
    "At the very end of your response, emit your one-paragraph summary inside a fenced code block tagged `" + RUNTIME_FINAL_MESSAGE_TAG + "`:",
    "",
    "```" + RUNTIME_FINAL_MESSAGE_TAG,
    "<one-paragraph summary of what you did, what changed, and any caveats>",
    "```",
    "",
    "This fenced block MUST be the last block in your output. The harness extracts its content verbatim into `runtime-final.txt`.",
    "",
  ].join("\n");
}

/**
 * Scan captured text for the LAST occurrence of the runtime-final-message
 * fenced block and return its inner content (trimmed). Returns `null` when
 * no sentinel block is present.
 *
 * Why LAST: a long mission may produce multiple intermediate blocks (e.g.
 * the model rehearsing a summary mid-turn); only the final terminal block
 * is the authoritative summary. Iterating with a stateful regex captures
 * the trailing occurrence in a single pass.
 *
 * Tolerates leading/trailing whitespace inside the fence, optional spaces
 * after the opening tag, and CRLF line endings. Does NOT match nested
 * fences (the sentinel block is by contract the outermost terminal block).
 */
export function extractRuntimeFinalMessageSentinel(text: string): string | null {
  const pattern = new RegExp(
    "```" + RUNTIME_FINAL_MESSAGE_TAG + "[ \\t]*\\r?\\n([\\s\\S]*?)\\r?\\n```",
    "g",
  );
  let match: RegExpExecArray | null;
  let last: string | null = null;
  while ((match = pattern.exec(text)) !== null) {
    last = match[1].trim();
  }
  return last;
}
