import { describe, test, expect } from "vitest";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

function withResolvers<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function runCmdcHook(input: unknown, env: NodeJS.ProcessEnv): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const hook = fileURLToPath(new URL("../src/extensions/tool-guard/cmdc-hook.ts", import.meta.url));
  const { promise, resolve, reject } = withResolvers<{ code: number | null; stdout: string; stderr: string }>();
  const child = spawn(process.execPath, ["--import", "tsx", hook], { env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", chunk => { stdout += String(chunk); });
  child.stderr.on("data", chunk => { stderr += String(chunk); });
  child.on("error", reject);
  child.on("close", code => resolve({ code, stdout, stderr }));
  child.stdin.end(JSON.stringify(input));
  return promise;
}

describe("Command Code guard hook", () => {
  test("a payload with tool_use_id produces a log line with call_id on allow and deny", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "uh-cmdc-hook-test-"));
    try {
      const policyPath = path.join(root, "tool-guard.json");
      const logPath = path.join(root, "tool-guard.log");
      await writeFile(policyPath, JSON.stringify({
        schema_version: "uh.tool-guard.v0",
        write_roots: ["."],
        deny_git_mutations: true,
        deny_package_installs: true,
        deny_network_clients: true,
        agent_clients: ["omp", "cmdc"],
        worker_root: root,
        protected_paths: [".harness", ".git"],
        controller_commands: false,
      }));
      const hookEnv = { ...process.env, UH_TOOL_GUARD_POLICY: policyPath, UH_TOOL_GUARD_LOG: logPath };

      // 1. Allowed call with tool_use_id
      const allowResult = await runCmdcHook({
        tool_name: "read_file",
        tool_use_id: "call_read_12345",
        tool_input: { file_path: path.join(root, "allowed.txt") },
      }, hookEnv);
      expect(allowResult.stdout.trim()).toBe("");

      // 2. Denied call with tool_use_id
      const denyResult = await runCmdcHook({
        tool_name: "shell_command",
        tool_use_id: "call_deny_67890",
        tool_input: { command: "git commit -m unauthorized" },
      }, hookEnv);
      const denyOutput = JSON.parse(denyResult.stdout.trim()) as {
        hookSpecificOutput?: { permissionDecision?: string };
      };
      expect(denyOutput.hookSpecificOutput?.permissionDecision).toBe("deny");

      // 3. Fallback tool_call_id
      await runCmdcHook({
        tool_name: "read_file",
        tool_call_id: "call_fallback_call_id",
        tool_input: { file_path: path.join(root, "allowed2.txt") },
      }, hookEnv);

      // 4. Fallback toolCallId
      await runCmdcHook({
        tool_name: "read_file",
        toolCallId: "call_fallback_camel_case",
        tool_input: { file_path: path.join(root, "allowed3.txt") },
      }, hookEnv);

      // 5. Payload without call id
      await runCmdcHook({
        tool_name: "read_file",
        tool_input: { file_path: path.join(root, "allowed4.txt") },
      }, hookEnv);

      const rawLog = await readFile(logPath, "utf8");
      const entries = rawLog.trim().split(/\r?\n/).map(l => JSON.parse(l) as Record<string, unknown>);

      expect(entries).toHaveLength(5);
      expect(entries[0].call_id).toBe("call_read_12345");
      expect(entries[0].class).toBe("allow");
      expect(entries[0].tool).toBe("read_file");

      expect(entries[1].call_id).toBe("call_deny_67890");
      expect(entries[1].class).toBe("git_mutation");
      expect(entries[1].tool).toBe("shell_command");
      expect(entries[1].reason).toContain("CONTRACT: no git mutations");

      expect(entries[2].call_id).toBe("call_fallback_call_id");
      expect(entries[2].class).toBe("allow");

      expect(entries[3].call_id).toBe("call_fallback_camel_case");
      expect(entries[3].class).toBe("allow");

      expect(entries[4].call_id).toBeUndefined();
      expect(entries[4].class).toBe("allow");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
