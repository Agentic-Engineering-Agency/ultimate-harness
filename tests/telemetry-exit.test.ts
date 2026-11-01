import { afterEach, describe, expect, test, vi } from "vitest";
import { Command } from "commander";

const spawned = vi.hoisted(() => ({ calls: [] as Array<{ command: string; args: string[]; env: NodeJS.ProcessEnv }> }));
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  const spawn = ((command: string, args: string[], options: { env?: NodeJS.ProcessEnv }) => {
    spawned.calls.push({ command, args, env: options.env ?? {} });
    return { unref: () => undefined, on: () => undefined } as unknown as ReturnType<typeof actual.spawn>;
  }) as unknown as typeof actual.spawn;
  return { ...actual, spawn };
});
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  // The beacon script is only built into dist; here its existence is the only thing the parent checks.
  return { ...actual, existsSync: (target: unknown) => String(target).includes("telemetry-beacon") ? true : actual.existsSync(target as string) };
});

import { installTelemetryHooks } from "../src/harness/telemetry.js";

/**
 * #211: a command that ends in `process.exit(1)` must report `status: failed` with its real exit code, through the
 * detached beacon, and the exit hook must send once. (A live capture server cannot be used: telemetry refuses
 * loopback and private hosts on purpose, so what is checked is exactly what the parent hands the beacon.)
 */
const enabled = { UH_TELEMETRY: "posthog", UH_POSTHOG_API_KEY: "phc_test_key", UH_POSTHOG_HOST: "https://collector.example.com" };
const saved: Record<string, string | undefined> = {};
afterEach(() => {
  for (const key of Object.keys(enabled)) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }
  spawned.calls.length = 0;
  process.removeAllListeners("exit-test-marker");
});

function enable(): void {
  for (const [key, value] of Object.entries(enabled)) { saved[key] = process.env[key]; process.env[key] = value; }
}

/** Run the hook as the CLI does and fire the `exit` event with `code`, without listeners other than ours. */
function exitWith(program: Command, code: number): void {
  const before = process.listeners("exit");
  installTelemetryHooks(program, "9.9.9");
  const ours = process.listeners("exit").filter((listener) => !before.includes(listener));
  expect(ours).toHaveLength(1);
  for (const listener of ours) (listener as (code: number) => void)(code);
  for (const listener of ours) process.removeListener("exit", listener as (code: number) => void);
}

describe("exit-safe telemetry", () => {
  test("a command that exits 1 is reported as failed with exit code 1, once", async () => {
    enable();
    const program = new Command().name("uh");
    const bad = program.command("validate").action(() => undefined);
    // preAction records which command ran, before the handler can call process.exit().
    program.hook("preAction", () => undefined);
    const before = process.listeners("exit");
    installTelemetryHooks(program, "9.9.9");
    const ours = process.listeners("exit").filter((listener) => !before.includes(listener));
    await program.parseAsync(["node", "uh", "validate"]);
    expect(bad.name()).toBe("validate");
    for (const listener of ours) (listener as (code: number) => void)(1);
    for (const listener of ours) (listener as (code: number) => void)(1); // a second exit event must not send again
    for (const listener of ours) process.removeListener("exit", listener as (code: number) => void);
    expect(spawned.calls).toHaveLength(1);
    const body = JSON.parse(spawned.calls[0].env.UH_BEACON_BODY as string) as { event: string; properties: Record<string, unknown> };
    expect(body.event).toBe("uh_command_outcome");
    expect(body.properties).toMatchObject({ command: "uh validate", status: "failed", exit_code: 1, version: "9.9.9" });
    expect(spawned.calls[0].env.UH_BEACON_URL).toBe("https://collector.example.com/capture/");
  });

  test("a command that exits 0 is reported as success", () => {
    enable();
    exitWith(new Command().name("uh"), 0);
    const body = JSON.parse(spawned.calls[0].env.UH_BEACON_BODY as string) as { properties: Record<string, unknown> };
    expect(body.properties).toMatchObject({ status: "success", exit_code: 0 });
  });
});
