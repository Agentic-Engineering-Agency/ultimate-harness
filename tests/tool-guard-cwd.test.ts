import { afterEach, describe, expect, test } from "vitest";
import { decideToolCall } from "../src/harness/tool-guard.js";
import { resolveToolGuardPolicy } from "../src/schema/runtime-control.js";

const workerRoot = "C:\\repo\\.harness\\w\\x";
const policy = {
  ...resolveToolGuardPolicy({ write_roots: ["src/harness", "out"] }),
  protected_paths: [],
};

const originalPolicyPath = process.env.UH_TOOL_GUARD_POLICY;
const originalLogPath = process.env.UH_TOOL_GUARD_LOG;

afterEach(() => {
  if (originalPolicyPath === undefined) delete process.env.UH_TOOL_GUARD_POLICY;
  else process.env.UH_TOOL_GUARD_POLICY = originalPolicyPath;
  if (originalLogPath === undefined) delete process.env.UH_TOOL_GUARD_LOG;
  else process.env.UH_TOOL_GUARD_LOG = originalLogPath;
});

function classOf(command: string, fields: Record<string, unknown> = {}) {
  return decideToolCall(policy, "shell_command", { command, ...fields }, workerRoot).deny?.class;
}

describe("tool guard effective working directory", () => {
  test.each([
    ["quoted powershell changes the real directory", `cd "C:\\repo" && powershell -Command "(Get-Content src/a.ts -Raw) -replace 'x','y' | Set-Content src/a.ts -NoNewline"`, "write_outside"],
    ["cd parent escapes the worker root", "cd .. && echo x > src/a.ts", "write_outside"],
    ["pushd outside then Set-Content", "pushd C:\\other; Set-Content a.txt y", "write_outside"],
    ["unresolved environment directory", "Set-Location $env:TEMP; Set-Content a.txt y", "write_outside"],
    ["variable assigned from environment remains unresolved", "$d=$env:TEMP; cd $d; Set-Content a.txt y", "write_outside"],
    ["nested bash body tracks directory", "bash -c \"cd C:\\\\other && echo x > out/a.txt\"", "write_outside"],
    ["explicit cwd outside the root", "echo x > out/a.txt", "write_outside", { cwd: "C:\\other" }],
    ["delete follows cd", "cd C:\\other && Remove-Item out/a.txt", "delete_outside"],
    ["copy follows cd", "cd C:\\other && Copy-Item source.txt out/a.txt", "write_outside"],
  ] as const)("denies %s", (_name, command, expected, fields: Record<string, unknown> | undefined = undefined) => {
    expect(classOf(command, fields ?? {})).toBe(expected);
  });

  test.each([
    ["cd into a write root", "cd src && echo x > harness/a.ts"],
    ["read after changing directory", "cd C:\\other && type file.txt"],
    ["popd restores the worker directory", "pushd C:\\other; popd; Set-Content out/a.txt y"],
  ] as const)("allows %s", (_name, command) => {
    expect(classOf(command)).toBeUndefined();
  });
});

describe("tool guard tamper denial", () => {
  test.each([
    ["policy path from the environment", "Set-Content C:\\private\\guard-policy.json y", "C:\\private\\guard-policy.json", undefined],
    ["state directory anywhere on disk", "Set-Content C:\\any\\where\\.harness\\x y", undefined, undefined],
    ["log path from the environment through a redirect", "echo x > C:\\private\\guard-log.json", undefined, "C:\\private\\guard-log.json"],
  ] as const)("denies %s as tamper", (_name, command, policyPath, logPath) => {
    if (policyPath) process.env.UH_TOOL_GUARD_POLICY = policyPath;
    if (logPath) process.env.UH_TOOL_GUARD_LOG = logPath;
    expect(classOf(command)).toBe("guard_tamper");
  });
});
