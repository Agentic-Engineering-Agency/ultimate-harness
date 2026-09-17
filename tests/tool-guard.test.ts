import { describe, expect, test } from "vitest";
import { decideToolCall } from "../src/harness/tool-guard.js";
import { resolveToolGuardPolicy } from "../src/schema/runtime-control.js";
import { RuntimeSupervision } from "../src/harness/runtime-supervision.js";

const root = "C:\\worker";
const policy = { ...resolveToolGuardPolicy({ write_roots: ["out"], agent_clients: ["omp", "cmdc"] }), protected_paths: [".harness", ".commandcode", ".omp", ".pi", ".git"] };
function decision(tool: string, input: unknown) { return decideToolCall(policy, tool, input, root).deny; }

describe("per-tool guard", () => {
  test.each([
    ["in-scope write", "write_file", { file_path: "out/report.md", content: "T:/forbidden" }, undefined],
    ["report content is blind", "write_file", { file_path: "out/report.md", content: "Do not retry; C:/private-project/docs" }, undefined],
    ["outside write", "write_file", { file_path: "src/x.ts", content: "x" }, "write_outside"],
    ["protected write", "write_file", { file_path: ".harness/x", content: "x" }, "protected_root"],
    ["absolute outside write", "write_file", { file_path: "C:\\other\\x", content: "x" }, "write_outside"],
    ["git status", "shell_command", { command: "git status C:/forbidden" }, undefined],
    ["git diff", "shell_command", { command: "git diff C:/forbidden" }, undefined],
    ["git commit", "shell_command", { command: "git commit -am x" }, "git_mutation"],
    ["pip install", "shell_command", { command: "pip install foo" }, "package_install"],
    ["npm install", "shell_command", { command: "npm install foo" }, "package_install"],
    ["curl", "shell_command", { command: "curl https://example.invalid" }, "network_client"],
    ["agent client", "shell_command", { command: "omp -p hello" }, "agent_client"],
    ["delete in root", "shell_command", { command: "rm -rf out/tmp" }, undefined],
    ["delete outside", "shell_command", { command: "rm -rf /" }, "delete_outside"],
    ["powershell protected", "shell_command", { command: 'powershell -Command "Set-Content .harness/x y"' }, "protected_root"],
    ["copy destination in root", "shell_command", { command: "Copy-Item src/x -Destination out/x" }, undefined],
    ["copy destination outside", "shell_command", { command: "Copy-Item out/x -Destination C:/other/x" }, "write_outside"],
    ["redirect in root", "shell_command", { command: "echo x > out/x" }, undefined],
    ["redirect protected", "shell_command", { command: "echo x > .commandcode/settings.json" }, "protected_root"],
    ["null redirect", "shell_command", { command: "echo x > nul" }, undefined],
    ["get content forbidden", "shell_command", { command: "Get-Content C:/forbidden/x" }, undefined],
    ["cat forbidden", "shell_command", { command: "cat C:/forbidden/x" }, undefined],
    ["ls forbidden", "shell_command", { command: "ls C:/forbidden" }, undefined],
    ["piped delete root", "shell_command", { command: "Get-ChildItem out/tmp -File | Remove-Item -Force" }, undefined],
    ["piped delete outside", "shell_command", { command: "Get-ChildItem C:/forbidden -File | Remove-Item -Force" }, "delete_outside"],
    ["kill", "shell_command", { command: "taskkill /F /IM python.exe" }, "kill_or_format"],
    ["format", "shell_command", { command: "format C:" }, "kill_or_format"],
  ] as const)("%s", (_name, tool, input, expected) => {
    expect(decision(tool, input)?.class).toBe(expected);
  });

  test("every denial reason includes substitute-action suffix", () => {
    const denial = decision("shell_command", { command: "git commit -m x" });
    expect(denial?.reason).toMatch(/Do not retry this by another route; record it in your final message and continue with the rest of the task\.$/);
  });
  test.each([
    ["python code read/remove", "shell_command", { command: "python -c \"import os; os.remove(r'C:\\x')\" && echo done" }, undefined],
    ["write commandcode redirect", "shell_command", { command: "python -c \"print(1)\" > .commandcode\\settings.json" }, "protected_root"],
    ["quoted redirect content", "shell_command", { command: "echo \"a > b\" | Out-File out\\x.txt" }, undefined],
    ["delete outside child items", "shell_command", { command: "Get-ChildItem C:\\forbidden -File | Remove-Item -Force" }, "delete_outside"],
    ["delete multiple in root", "shell_command", { command: "Remove-Item out\\reference\\a.csv,out\\reference\\b.csv -ErrorAction SilentlyContinue" }, undefined],
    ["delete mixed targets", "shell_command", { command: "Remove-Item out\\a.csv,C:\\forbidden\\b.csv -ErrorAction SilentlyContinue" }, "delete_outside"],
    ["delete protected root", "shell_command", { command: "Remove-Item -Recurse -Force .commandcode" }, "protected_root"],
    ["batch copy root", "shell_command", { command: "set SRC=C:\\source && mkdir out 2>nul & xcopy /E /I /Y \"%SRC%\\episodes\" \"out\\episodes\" & dir out >nul 2>&1" }, undefined],
    ["external redirect", "shell_command", { command: "python x.py > C:\\log.txt" }, "write_outside"],
    ["copy external source root destination", "shell_command", { command: "Copy-Item -Path C:\\source\\x.csv -Destination out\\x.csv" }, undefined],
    ["copy external destination", "shell_command", { command: "Copy-Item -Path out\\x.csv -Destination C:\\forbidden\\x.csv" }, "write_outside"],
    ["out-file external", "shell_command", { command: "\"a\" | Out-File -FilePath C:\\x.txt" }, "write_outside"],
    ["powershell delete outside", "shell_command", { command: "powershell -Command \"$d='C:\\\\forbidden'; Remove-Item -Recurse $d\"" }, "delete_outside"],
    ["copy external", "shell_command", { command: "copy out\\a.csv C:\\forbidden\\b.csv" }, "write_outside"],
    ["git commit path", "shell_command", { command: "git -C C:/other commit -am x" }, "git_mutation"],
    ["agent command", "shell_command", { command: "omp -p hello" }, "agent_client"],
    ["credential read", "read_file", { file_path: "C:\\Users\\example\\.claude\\.credentials.json" }, undefined],
  ] as const)("ported launcher case: %s", (_name, tool, input, expected) => {
    expect(decision(tool, input)?.class).toBe(expected);
  });

  test("oh-my-pi native guard errors count as denials only for CONTRACT text", () => {
    const run = new RuntimeSupervision({ max_denials: 2 }, 0);
    run.observe({ type: "tool_execution_start", tool: "bash", command: "git commit -m x", id: "one" }, 1);
    run.observe({ type: "tool_execution_end", id: "one", isError: true, result: "CONTRACT: no git mutations; the harness commits for you." }, 2);
    run.observe({ type: "tool_execution_start", tool: "bash", command: "python broken.py", id: "two" }, 3);
    run.observe({ type: "tool_execution_end", id: "two", isError: true, result: "ordinary tool failure" }, 4);
    expect(run.denials).toBe(1);
    expect(run.stopReason).toBeUndefined();
  });

  test("oh-my-pi native guard errors enforce denial budget once per call", () => {
    const run = new RuntimeSupervision({ max_denials: 2 }, 0);
    const reason = "CONTRACT: no git mutations; the harness commits for you.";
    run.observe({ type: "tool_execution_start", tool: "bash", command: "git commit -m x", id: "one" }, 1);
    run.observe({ type: "tool_execution_end", id: "one", isError: true, result: reason }, 2);
    run.observe({ type: "tool_execution_end", id: "one", isError: true, result: reason }, 3);
    run.observe({ type: "tool_execution_start", tool: "bash", command: "git commit -m y", id: "two" }, 4);
    run.observe({ type: "tool_execution_end", id: "two", isError: true, result: reason }, 5);
    expect(run.denials).toBe(2);
    expect(run.stopReason).toBe("denial_budget");
    expect(run.failure).toMatch(/bash git commit -m y/);
  });
});
  test("read-only git log grep text is allowed while git commit is denied", () => {
    expect(decision("shell_command", { command: "git log --grep=commit" })).toBeUndefined();
    expect(decision("shell_command", { command: "git commit -am x" })?.class).toBe("git_mutation");
  });
