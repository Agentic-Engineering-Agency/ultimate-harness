import { afterEach, describe, expect, test } from "vitest";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { parse, stringify } from "yaml";
import { initializeHarness } from "../src/harness/init.js";
import { NotificationsSchema } from "../src/schema/project.js";
import { windowsRegExecutable, windowsToastScript } from "../src/harness/notifications.js";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const execFileP = promisify(execFile);
const dirs: string[] = [];
afterEach(async () => { while (dirs.length > 0) await rm(dirs.pop() as string, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); });

/**
 * #267 (toast, #249): `uh notify detect`, `list` and `test` with `--root` had no CLI test; a toast app id could carry a
 * typographic quote that PowerShell treats as a quote; `app_id` was accepted on every preset though only windows-toast
 * reads it; and `uh notify detect` ran a bare `reg`, which Windows looks up in the current directory first.
 */
async function project(sinks: unknown[]) {
  const root = await mkdtemp(path.join(tmpdir(), "uh-cli-notify-"));
  const elsewhere = await mkdtemp(path.join(tmpdir(), "uh-cli-notify-cwd-"));
  dirs.push(root, elsewhere);
  await initializeHarness(root);
  const file = path.join(root, ".harness", "project.yaml");
  const config = parse(await readFile(file, "utf-8")) as Record<string, unknown>;
  config.notifications = { sinks };
  await writeFile(file, stringify(config), "utf-8");
  return { root, elsewhere };
}
const uh = async (cwd: string, args: string[]) => {
  try {
    const { stdout, stderr } = await execFileP(process.execPath, ["--import", pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href, path.resolve("src/cli.ts"), ...args], { cwd, env: { ...process.env, UH_USER_DATA_DIR: path.join(cwd, "user-data"), UH_NOTIFICATIONS_TRUST_PROJECT: "1" } });
    return { code: 0, out: stdout, err: stderr };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failure.code ?? 1, out: failure.stdout ?? "", err: failure.stderr ?? "" };
  }
};

describe("uh notify with --root", () => {
  test("list shows the sinks of the project named by --root, not of the working directory", async () => {
    const { root, elsewhere } = await project([{ id: "hook", kind: "webhook", url: "http://127.0.0.1:9/never", events: ["run.settled"] }]);
    const listed = await uh(elsewhere, ["notify", "list", "--root", root, "--json"]);
    expect(listed.code, listed.err).toBe(0);
    const body = JSON.parse(listed.out) as { schema_version: string; sinks: Array<{ id: string }> };
    expect(body.schema_version).toBe("uh.notify.list.v0");
    expect(body.sinks.map((sink) => sink.id)).toEqual(["hook"]);
  }, 60_000);

  test("test delivers to a command sink of that project and reports the outcome", async () => {
    const { root, elsewhere } = await project([]);
    const marker = path.join(root, "delivered.txt");
    const writer = path.join(root, "writer.cjs");
    await writeFile(writer, `require("node:fs").writeFileSync(${JSON.stringify(marker)}, process.env.UH_NOTIFICATION_EVENT || "");\n`, "utf-8");
    const file = path.join(root, ".harness", "project.yaml");
    const config = parse(await readFile(file, "utf-8")) as Record<string, unknown>;
    config.notifications = { sinks: [{ id: "capture", kind: "command", argv: [process.execPath, writer], events: ["run.settled"] }] };
    await writeFile(file, stringify(config), "utf-8");
    const tested = await uh(elsewhere, ["notify", "test", "--root", root, "--json"]);
    expect(tested.code, tested.out + tested.err).toBe(0);
    const body = JSON.parse(tested.out) as { schema_version: string; attempts: Array<{ sink: string; outcome: string }> };
    expect(body.schema_version).toBe("uh.notify.test.v0");
    expect(body.attempts).toMatchObject([{ sink: "capture", outcome: "ok" }]);
    expect(await readFile(marker, "utf-8")).toContain("notify.test");
  }, 60_000);

  test("detect names every preset and prints the root it was given", async () => {
    const { root, elsewhere } = await project([]);
    const detected = await uh(elsewhere, ["notify", "detect", "--root", root, "--json"]);
    expect(detected.code, detected.err).toBe(0);
    const body = JSON.parse(detected.out) as { schema_version: string; root: string; presets: Array<{ preset: string }> };
    expect(body.schema_version).toBe("uh.notify.detect.v0");
    expect(path.resolve(body.root)).toBe(path.resolve(root));
    expect(body.presets.map((entry) => entry.preset).sort()).toEqual(["apprise", "hermes", "ntfy", "windows-toast"]);
  }, 60_000);
});

describe("toast hardening", () => {
  test("every typographic single quote in an app id is doubled, so none can end the PowerShell literal", () => {
    const script = windowsToastScript("A\u2018B\u2019C\u201AD\u201BE'F");
    const literal = /CreateToastNotifier\((.*)\)\.Show/.exec(script)![1];
    expect(literal).toBe("'A\u2018\u2018B\u2019\u2019C\u201A\u201AD\u201B\u201BE''F'");
  });

  test("app_id is accepted on the windows-toast preset only", () => {
    expect(() => NotificationsSchema.parse({ sinks: [{ id: "t", preset: "windows-toast", app_id: "My.App" }] })).not.toThrow();
    expect(() => NotificationsSchema.parse({ sinks: [{ id: "n", preset: "ntfy", server: "https://ntfy.example", topic: "t", app_id: "My.App" }] })).toThrow(/app_id/);
    expect(() => NotificationsSchema.parse({ sinks: [{ id: "h", preset: "hermes", to: "me", app_id: "My.App" }] })).toThrow(/app_id/);
  });

  test("the registry is queried through reg.exe under the Windows folder, never a bare name", () => {
    expect(windowsRegExecutable({ SystemRoot: "D:\\WINDOWS" })).toBe("D:\\WINDOWS\\System32\\reg.exe");
    expect(windowsRegExecutable({ windir: "E:\\Win" })).toBe("E:\\Win\\System32\\reg.exe");
    expect(windowsRegExecutable({})).toBe("C:\\Windows\\System32\\reg.exe");
  });
});
