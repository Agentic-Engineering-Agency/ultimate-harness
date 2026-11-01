import { nativeToolFailure } from "../src/harness/native-tool-result.js";

describe("nativeToolFailure", () => {
  test("a Command Code failure is the leading Exit code line of a text result block", () => {
    expect(nativeToolFailure({ type: "tool_completed", result: [{ type: "text", text: "Exit code: 1\n<stderr text>" }] }))
      .toEqual({ failed: true, exit_code: 1, source: "text" });
  });

  test("a leading Exit code 0 line is a Command Code success", () => {
    expect(nativeToolFailure({ type: "tool_completed", result: [{ type: "text", text: "Exit code: 0\n<stdout text>" }] }))
      .toEqual({ failed: false, exit_code: 0, source: "text" });
  });

  test("an Exit code line later in stdout is not a failure", () => {
    expect(nativeToolFailure({ type: "tool_completed", result: [{ type: "text", text: "x\nExit code: 1\nx" }] }))
      .toEqual({ failed: false, source: "none" });
  });

  test("text without an Exit code line is not a failure", () => {
    expect(nativeToolFailure({ type: "tool_completed", result: [{ type: "text", text: "x" }] }))
      .toEqual({ failed: false, source: "none" });
  });

  test("a malformed Exit code line is not an exit code", () => {
    expect(nativeToolFailure({ type: "tool_completed", result: [{ type: "text", text: "Exit code: x\n" }] }))
      .toEqual({ failed: false, source: "none" });
  });

  test("oh-my-pi isError semantics are unchanged", () => {
    expect(nativeToolFailure({ type: "tool_execution_end", isError: true, result: { isError: true } }))
      .toEqual({ failed: true, source: "field" });
    expect(nativeToolFailure({ type: "tool_execution_end", isError: false, result: { isError: false } }))
      .toEqual({ failed: false, source: "field" });
  });

  test("structured exit codes decide without reading text", () => {
    expect(nativeToolFailure({ type: "tool_execution_end", result: { exitCode: 2 } }))
      .toEqual({ failed: true, exit_code: 2, source: "field" });
    expect(nativeToolFailure({ type: "tool_execution_end", result: { exit_code: 0 } }))
      .toEqual({ failed: false, exit_code: 0, source: "field" });
  });

  test("an is_error field decides even when the text mentions exit codes", () => {
    expect(nativeToolFailure({
      type: "tool_execution_end",
      result: { is_error: false, content: [{ type: "text", text: "Exit code: 1\nx" }] },
    })).toEqual({ failed: false, source: "field" });
  });

  test("unknown shapes are not failures", () => {
    expect(nativeToolFailure({ type: "tool_completed" })).toEqual({ failed: false, source: "none" });
    expect(nativeToolFailure({ type: "tool_completed", result: { output: "Exit code: 3" } }))
      .toEqual({ failed: false, source: "none" });
    expect(nativeToolFailure({ type: "tool_completed", result: [{ type: "image", source: "x" }] }))
      .toEqual({ failed: false, source: "none" });
  });
});
