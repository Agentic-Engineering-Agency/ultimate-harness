import { describe, expect, test } from "vitest";
import {
  RUNTIME_FINAL_MESSAGE_TAG,
  extractRuntimeFinalMessageSentinel,
  runtimeFinalMessageInstruction,
} from "../src/harness/runtime-final-message.js";

describe("runtimeFinalMessageInstruction", () => {
  test("includes the sentinel tag and a fenced example", () => {
    const instruction = runtimeFinalMessageInstruction();
    expect(instruction).toContain(RUNTIME_FINAL_MESSAGE_TAG);
    expect(instruction).toContain("```" + RUNTIME_FINAL_MESSAGE_TAG);
    expect(instruction).toContain("```");
    expect(instruction).toContain("MUST be the last block");
  });

  test("is deterministic and idempotent", () => {
    expect(runtimeFinalMessageInstruction()).toBe(runtimeFinalMessageInstruction());
  });
});

describe("extractRuntimeFinalMessageSentinel", () => {
  test("extracts the inner content of a single sentinel block", () => {
    const text = [
      "Some preamble.",
      "",
      "```uh-runtime-final-message",
      "Wrote docs/codex-smoke.txt with a single ISO timestamp line.",
      "```",
      "",
    ].join("\n");
    expect(extractRuntimeFinalMessageSentinel(text)).toBe(
      "Wrote docs/codex-smoke.txt with a single ISO timestamp line.",
    );
  });

  test("returns the LAST sentinel block when multiple are present", () => {
    const text = [
      "```uh-runtime-final-message",
      "first draft",
      "```",
      "",
      "More work.",
      "",
      "```uh-runtime-final-message",
      "final summary",
      "```",
    ].join("\n");
    expect(extractRuntimeFinalMessageSentinel(text)).toBe("final summary");
  });

  test("returns null when no sentinel block is present", () => {
    const text = "Just a regular message with no sentinel.\n```yaml\nkey: value\n```\n";
    expect(extractRuntimeFinalMessageSentinel(text)).toBeNull();
  });

  test("trims whitespace inside the fence", () => {
    const text = [
      "```uh-runtime-final-message",
      "",
      "   indented body   ",
      "",
      "```",
    ].join("\n");
    expect(extractRuntimeFinalMessageSentinel(text)).toBe("indented body");
  });

  test("tolerates CRLF line endings", () => {
    const text = "```uh-runtime-final-message\r\nwindows summary\r\n```\r\n";
    expect(extractRuntimeFinalMessageSentinel(text)).toBe("windows summary");
  });

  test("ignores fences with different tags", () => {
    const text = [
      "```yaml",
      "schema_version: uh.runtime-result.v0",
      "```",
      "```text",
      "not the sentinel",
      "```",
    ].join("\n");
    expect(extractRuntimeFinalMessageSentinel(text)).toBeNull();
  });

  test("does not match an unclosed fence", () => {
    const text = "```uh-runtime-final-message\nno closer";
    expect(extractRuntimeFinalMessageSentinel(text)).toBeNull();
  });
});
