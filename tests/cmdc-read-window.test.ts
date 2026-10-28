import { afterEach, describe, expect, test } from "vitest";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runToolGuard, type ToolGuardReadWindow } from "../src/extensions/tool-guard/core.js";

/**
 * The read-window rule as the Command Code hook configures it: a whole-file
 * read of a file over 40000 bytes must instead read windows of at most 600
 * lines with `offset` and `limit`.
 */
const READ_WINDOW: ToolGuardReadWindow = { maxBytes: 40000, maxLines: 600 };

/** A real policy artifact a Command Code run writes, with an isolated worker root. */
async function writePolicy(directory: string): Promise<{ policyPath: string; workerRoot: string }> {
  const workerRoot = path.join(directory, "worker");
  await mkdir(workerRoot, { recursive: true });
  const policyPath = path.join(directory, "tool-guard.json");
  await writeFile(policyPath, JSON.stringify({
    schema_version: "uh.tool-guard.v0",
    write_roots: ["out"],
    deny_git_mutations: true,
    deny_package_installs: true,
    deny_network_clients: true,
    agent_clients: ["omp", "cmdc"],
    allow_native_subagents: false,
    worker_root: workerRoot,
    protected_paths: [".harness", ".git"],
    controller_commands: false,
  }));
  return { policyPath, workerRoot };
}

function parseLog(raw: string): Array<Record<string, unknown>> {
  return raw.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line) as Record<string, unknown>);
}

async function writeBytes(file: string, bytes: number): Promise<void> {
  await writeFile(file, Buffer.alloc(bytes, 0x61));
}

const directories: string[] = [];

async function fixture(): Promise<{ directory: string; policyPath: string; workerRoot: string; logPath: string }> {
  const directory = await mkdtemp(path.join(tmpdir(), "uh-cmdc-read-window-"));
  directories.push(directory);
  const { policyPath, workerRoot } = await writePolicy(directory);
  return { directory, policyPath, workerRoot, logPath: path.join(directory, "tool-guard.log") };
}

afterEach(async () => {
  while (directories.length > 0) await rm(directories.pop() as string, { recursive: true, force: true });
});

describe("Command Code read window", () => {
  test("(a) a whole-file read of a file over 40000 bytes is denied with the window reason and logged", async () => {
    const { policyPath, workerRoot, logPath } = await fixture();
    const file = path.join(workerRoot, "big.txt");
    await writeBytes(file, 40001);

    const verdict = await runToolGuard({
      policyPath, logPath, readWindow: READ_WINDOW,
      call: { tool: "read_file", input: { file_path: file }, callId: "call-big" },
    });

    expect(verdict.decision).toBe("deny");
    expect(verdict.class).toBe("read_window");
    expect(verdict.target).toBe(file);
    expect(verdict.reason).toContain("40001 bytes");
    expect(verdict.reason).toContain("too large to read whole");
    expect(verdict.reason).toContain("windows of at most 600 lines");
    expect(verdict.reason).toContain("using offset and limit");
    expect(verdict.reason?.startsWith("CONTRACT:")).toBe(true);

    const entries = parseLog(await readFile(logPath, "utf8"));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ call_id: "call-big", tool: "read_file", class: "read_window", target: file });
    expect(String(entries[0].reason)).toContain("too large to read whole");
  });

  test("(b) the same file read with offset and a limit of 600 is allowed", async () => {
    const { policyPath, workerRoot, logPath } = await fixture();
    const file = path.join(workerRoot, "big.txt");
    await writeBytes(file, 40001);

    const verdict = await runToolGuard({
      policyPath, logPath, readWindow: READ_WINDOW,
      call: { tool: "read_file", input: { file_path: file, offset: 1, limit: 600 }, callId: "call-window" },
    });

    expect(verdict.decision).toBe("allow");
    const entries = parseLog(await readFile(logPath, "utf8"));
    expect(entries[0]).toMatchObject({ call_id: "call-window", tool: "read_file", class: "allow" });
  });

  test("(c) the same file with a limit above 600 lines is denied", async () => {
    const { policyPath, workerRoot, logPath } = await fixture();
    const file = path.join(workerRoot, "big.txt");
    await writeBytes(file, 40001);

    const verdict = await runToolGuard({
      policyPath, logPath, readWindow: READ_WINDOW,
      call: { tool: "read_file", input: { file_path: file, offset: 1, limit: 601 }, callId: "call-wide" },
    });

    expect(verdict.decision).toBe("deny");
    expect(verdict.class).toBe("read_window");
    const entries = parseLog(await readFile(logPath, "utf8"));
    expect(entries[0]).toMatchObject({ call_id: "call-wide", class: "read_window" });
  });

  test("(d) a file of 40000 bytes or less read whole is allowed", async () => {
    const { policyPath, workerRoot, logPath } = await fixture();
    const file = path.join(workerRoot, "exact.txt");
    await writeBytes(file, 40000);

    const verdict = await runToolGuard({
      policyPath, logPath, readWindow: READ_WINDOW,
      call: { tool: "read_file", input: { file_path: file }, callId: "call-exact" },
    });

    expect(verdict.decision).toBe("allow");
    const entries = parseLog(await readFile(logPath, "utf8"));
    expect(entries[0]).toMatchObject({ call_id: "call-exact", class: "allow" });
  });

  test("(e) a path that does not exist is not denied by this rule", async () => {
    const { policyPath, workerRoot, logPath } = await fixture();
    const missing = path.join(workerRoot, "missing.txt");

    const verdict = await runToolGuard({
      policyPath, logPath, readWindow: READ_WINDOW,
      call: { tool: "read_file", input: { file_path: missing }, callId: "call-missing" },
    });

    expect(verdict.decision).toBe("allow");
    const entries = parseLog(await readFile(logPath, "utf8"));
    expect(entries[0]).toMatchObject({ call_id: "call-missing", class: "allow" });
  });

  test("(f) without the option a large whole-file read is allowed, so other wrappers are unchanged", async () => {
    const { policyPath, workerRoot, logPath } = await fixture();
    const file = path.join(workerRoot, "big.txt");
    await writeBytes(file, 40001);

    const verdict = await runToolGuard({
      policyPath, logPath,
      call: { tool: "read_file", input: { file_path: file }, callId: "call-no-window" },
    });

    expect(verdict.decision).toBe("allow");
    const entries = parseLog(await readFile(logPath, "utf8"));
    expect(entries[0]).toMatchObject({ call_id: "call-no-window", class: "allow" });
  });

  test("(g) a large read outside worker_root is denied with the window reason, and a windowed read is allowed", async () => {
    const { policyPath, logPath } = await fixture();
    const outside = await mkdtemp(path.join(tmpdir(), "uh-cmdc-outside-"));
    directories.push(outside);
    const file = path.join(outside, "big.txt");
    await writeBytes(file, 40001);

    const whole = await runToolGuard({
      policyPath, logPath, readWindow: READ_WINDOW,
      call: { tool: "read_file", input: { file_path: file }, callId: "call-outside-whole" },
    });

    // The rule now applies to any path, inside or outside `worker_root`, so a
    // whole-file read of a large file outside the worktree is still denied.
    expect(whole.decision).toBe("deny");
    expect(whole.class).toBe("read_window");
    expect(whole.target).toBe(file);
    expect(whole.reason).toContain("40001 bytes");
    expect(whole.reason).toContain("too large to read whole");
    expect(whole.reason).toContain("windows of at most 600 lines");
    expect(whole.reason).toContain("using offset and limit");

    const windowed = await runToolGuard({
      policyPath, logPath, readWindow: READ_WINDOW,
      call: { tool: "read_file", input: { file_path: file, offset: 1, limit: 600 }, callId: "call-outside-window" },
    });

    expect(windowed.decision).toBe("allow");
    const entries = parseLog(await readFile(logPath, "utf8"));
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ call_id: "call-outside-whole", class: "read_window", target: file });
    expect(entries[1]).toMatchObject({ call_id: "call-outside-window", class: "allow" });
  });

  test("the path policy runs first: a call it denies keeps its class with the option set", async () => {
    const { policyPath, workerRoot, logPath } = await fixture();
    const blocked = path.join(workerRoot, "outside", "blocked.txt");

    const verdict = await runToolGuard({
      policyPath, logPath, readWindow: READ_WINDOW,
      call: { tool: "write_file", input: { file_path: blocked }, callId: "call-write" },
    });

    expect(verdict.decision).toBe("deny");
    expect(verdict.class).toBe("write_outside");
    expect(verdict.reason).toContain("CONTRACT: write only under out");
  });

  test("the Command Code hook opts into the window rule end to end", async () => {
    const { policyPath, workerRoot, logPath } = await fixture();
    const file = path.join(workerRoot, "big.txt");
    await writeBytes(file, 40001);
    const hook = fileURLToPath(new URL("../src/extensions/tool-guard/cmdc-hook.ts", import.meta.url));

    const result = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(process.execPath, ["--import", "tsx", hook], {
        env: { ...process.env, UH_TOOL_GUARD_POLICY: policyPath, UH_TOOL_GUARD_LOG: logPath },
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", chunk => { stdout += String(chunk); });
      child.stderr.on("data", chunk => { stderr += String(chunk); });
      child.on("error", reject);
      child.on("close", () => resolve({ stdout, stderr }));
      child.stdin.end(JSON.stringify({ tool_name: "read_file", tool_use_id: "call-hook", tool_input: { file_path: file } }));
    });

    const output = JSON.parse(result.stdout.trim()) as {
      hookSpecificOutput?: { permissionDecision?: string; permissionDecisionReason?: string };
    };
    expect(output.hookSpecificOutput?.permissionDecision).toBe("deny");
    expect(output.hookSpecificOutput?.permissionDecisionReason).toContain("too large to read whole");

    const entries = parseLog(await readFile(logPath, "utf8"));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ call_id: "call-hook", tool: "read_file", class: "read_window" });
  });
});
