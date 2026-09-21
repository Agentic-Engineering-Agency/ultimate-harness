import { describe, expect, test } from "vitest";
import { decideToolCall } from "../src/harness/tool-guard.js";
import { resolveToolGuardPolicy } from "../src/schema/runtime-control.js";

const root = "C:\\worker";
const BS = "\\";
const winShim = `& "C:${BS}Users${BS}me${BS}AppData${BS}Roaming${BS}npm${BS}omp.cmd" -p hi`;

function classOf(command: string, policy = resolveToolGuardPolicy({}), options = {}) {
  return decideToolCall(policy, "bash", { command }, root, options).deny?.class;
}

describe("agent-client denial: workers never spawn agents", () => {
  test.each([
    ["bare client", "omp --print hi"],
    ["windows cmd shim", "codex.cmd exec hi"],
    ["windows exe", "omp.exe -p hi"],
    ["posix absolute path", "/usr/bin/codex exec hi"],
    ["powershell call operator with quoted path", winShim],
    ["claude cli", "claude -p hi"],
    ["uh cli", "uh mission run m.yaml"],
    ["uh cli script via node", "node dist/cli.js mission run-team x"],
    ["uh cli script via bun with absolute path", "bun C:/repo/dist/cli.js mission run m.yaml"],
    ["npx launcher", "npx codex exec hi"],
    ["npx launcher with flag", "npx -y codex exec hi"],
    ["bunx launcher", "bunx omp -p hi"],
    ["pnpm dlx launcher", "pnpm dlx codex exec hi"],
    ["env prefix", "env FOO=1 omp -p hi"],
    ["inline assignment prefix", "FOO=1 omp -p hi"],
    ["after chain", "cd src && omp -p hi"],
    ["after pipe", "cat prompt.md | claude -p"],
    ["command substitution", "echo $(omp -p hi)"],
    ["backtick substitution", "echo `codex exec hi`"],
    ["bash -c body", "bash -c \"omp -p hi\""],
    ["powershell -Command body", "powershell -Command \"cmdc -p hi\""],
    ["xargs", "cat prompts.txt | xargs omp -p"],
    ["uppercase", "OMP -p hi"],
  ])("denies %s", (_name, command) => {
    expect(classOf(command)).toBe("agent_client");
  });

  test.each([
    ["client name as grep pattern", "grep -r omp src"],
    ["client name as file stem", "cat docs/codex.md"],
    ["client name in a path argument", "ls src/adapters/codex.ts .omp"],
    ["client name inside a quoted string", "echo \"run omp later\""],
    ["ripgrep for the uh cli", "rg \"uh mission run\" docs"],
    ["node running an unrelated script", "node scripts/build.js mission run"],
    ["reading the cli bundle", "cat dist/cli.js"],
    ["git log mentioning a client", "git log --grep codex"],
  ])("allows %s", (_name, command) => {
    expect(classOf(command)).toBeUndefined();
  });

  test("needs_network lifts network-client denial but never agent-client denial", () => {
    const policy = resolveToolGuardPolicy({}, true);
    expect(policy.deny_network_clients).toBe(false);
    expect(classOf("curl https://example.invalid", policy)).toBeUndefined();
    expect(classOf("omp -p hi", policy)).toBe("agent_client");
    expect(classOf("claude -p hi", policy)).toBe("agent_client");
    expect(classOf("uh mission run m.yaml", policy)).toBe("agent_client");
  });

  test("an explicit empty agent_clients list is the only opt-out", () => {
    const policy = resolveToolGuardPolicy({ agent_clients: [] });
    expect(classOf("omp -p hi", policy)).toBeUndefined();
  });

  test("a custom agent_clients list replaces the defaults", () => {
    const policy = resolveToolGuardPolicy({ agent_clients: ["goose"] });
    expect(classOf("goose run", policy)).toBe("agent_client");
    expect(classOf("omp -p hi", policy)).toBeUndefined();
  });

  test("the orchestrator role still reaches the UH controller, and only that", () => {
    const policy = resolveToolGuardPolicy({});
    const orchestrator = { allowControllerCommands: true };
    expect(classOf("uh mission run-team x", policy, orchestrator)).toBeUndefined();
    expect(classOf("node dist/cli.js mission run m.yaml", policy, orchestrator)).toBeUndefined();
    expect(classOf("omp -p hi", policy, orchestrator)).toBe("agent_client");
    expect(classOf("uh mission run m.yaml --force", policy, orchestrator)).toBe("agent_client");
    expect(classOf("uh mission run m.yaml && omp -p hi", policy, orchestrator)).toBe("agent_client");
  });
});
