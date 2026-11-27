import { describe, expect, test } from "vitest";
import { decideToolCall } from "../src/harness/tool-guard.js";
import { resolveToolGuardPolicy } from "../src/schema/runtime-control.js";

const root = "C:\\worker";
const policy = { ...resolveToolGuardPolicy({ write_roots: ["out"] }), protected_paths: [] };

function denial(tool: string, input: unknown) {
  return decideToolCall(policy, tool, input, root).deny;
}

const REASON = "CONTRACT: virtual devices are not available in this run. Do not retry this by another route; record it in your final message and continue with the rest of the task.";
const PATH_CLASSES = ["write_outside", "delete_outside", "protected_root", "guard_tamper"];

describe("tool guard virtual-device denial", () => {
  test.each([
    ["shell redirect to an lsp device", "shell_command", { command: "echo x > xd://lsp" }],
    ["Set-Content to a report device", "shell_command", { command: "Set-Content xd://report_issue y" }],
    ["Out-File to an lsp device", "shell_command", { command: '"x" | Out-File xd://lsp' }],
    ["delete of an lsp device", "shell_command", { command: "Remove-Item xd://lsp" }],
    ["uppercase scheme", "shell_command", { command: "echo x > XD://lsp" }],
    ["direct write tool to an lsp device", "write_file", { file_path: "xd://lsp", content: "x" }],
    ["direct write tool to a report device", "write_file", { file_path: "xd://report_issue", content: "x" }],
  ] as const)("denies %s as virtual_device", (_name, tool, input) => {
    const result = denial(tool, input);
    expect(result?.class).toBe("virtual_device");
    expect(result?.reason).toBe(REASON);
    expect(PATH_CLASSES).not.toContain(result?.class);
  });

  test.each([
    ["reading an lsp device", "shell_command", { command: "Get-Content xd://lsp" }],
    ["grepping for a device name", "shell_command", { command: "grep -r xd://lsp src" }],
    ["a relative path that merely starts with xd", "shell_command", { command: "echo x > out/xd-report.txt" }],
    ["a relative write in a write root", "write_file", { file_path: "out/report.md", content: "x" }],
  ] as const)("allows %s", (_name, tool, input) => {
    expect(denial(tool, input)).toBeUndefined();
  });
});
