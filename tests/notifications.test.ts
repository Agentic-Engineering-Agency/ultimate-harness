import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NotificationsSchema } from "../src/schema/project.js";
import {
  DEFAULT_EVENT_ENV,
  DEFAULT_TOAST_APP_ID,
  TOAST_HANDED_OFF_MESSAGE,
  buildSettlementEvents,
  buildTeamSettledEvent,
  deliveriesPath,
  deliverToSink,
  describeSink,
  detectPresets,
  dispatchEvent,
  drainNotifications,
  elapsedMs,
  expandPreset,
  loadNotificationConfig,
  notifyRunSettled,
  parseWindowsToastSetting,
  readWindowsToastSetting,
  reportAttempt,
  resolveSink,
  sinkMatches,
  sinkConfirmation,
  windowsToastScript,
  type DeliveryAttempt,
  type NotificationEvent,
  type ResolvedCommandSink,
  type ResolvedWebhookSink,
  type WindowsToastPresetSink,
} from "../src/harness/notifications.js";

let WORK: string;
let ROOT: string;
let USER_FILE: string;
let CAPTURE_FILE: string;
let CAPTURE_SCRIPT: string;
let env: NodeJS.ProcessEnv;

const NOW = "2026-09-22T12:00:00.000Z";

const CAPTURE_SOURCE = [
  'import { appendFileSync } from "node:fs";',
  'const label = process.argv[2] ?? "sink";',
  'let data = "";',
  'process.stdin.setEncoding("utf8");',
  'process.stdin.on("data", (chunk) => { data += chunk; });',
  'process.stdin.on("end", () => {',
  '  const event = process.env.UH_NOTIFICATION_EVENT ? JSON.parse(process.env.UH_NOTIFICATION_EVENT) : null;',
  '  appendFileSync(process.env.CAPTURE_FILE, JSON.stringify({ label, message: data.trim(), event }) + "\\n");',
  '});',
].join("\n");

async function readCaptureFile(): Promise<Array<{ label: string; message: string; event: NotificationEvent | null }>> {
  let text: string;
  try {
    text = await readFile(CAPTURE_FILE, "utf8");
  } catch {
    return [];
  }
  return text.split("\n").filter((line) => line.trim().length > 0).map((line) => JSON.parse(line));
}

function commandSink(id: string): ResolvedCommandSink {
  return {
    id,
    kind: "command",
    transport: "command",
    argv: [process.execPath, CAPTURE_SCRIPT, id],
    envVar: DEFAULT_EVENT_ENV,
    events: ["*"],
  };
}

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 10_000, intervalMs = 50): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("waitFor timed out");
}

beforeEach(async () => {
  WORK = await mkdtemp(path.join(tmpdir(), "uh-notify-"));
  ROOT = path.join(WORK, "project");
  await mkdir(path.join(ROOT, ".harness"), { recursive: true });
  await writeFile(path.join(ROOT, ".harness", "project.yaml"), "schema_version: uh.project.v0\nname: notify fixture\n", "utf8");
  USER_FILE = path.join(WORK, "user-notifications.yaml");
  CAPTURE_FILE = path.join(WORK, "capture.ndjson");
  CAPTURE_SCRIPT = path.join(WORK, "capture.mjs");
  await writeFile(CAPTURE_SCRIPT, CAPTURE_SOURCE, "utf8");
  env = { ...process.env, UH_NOTIFICATIONS_FILE: USER_FILE, CAPTURE_FILE };
});

afterEach(async () => {
  // Fire-and-forget settlements append to the ledger asynchronously; wait for
  // them before removing the temporary project so cleanup never races a write.
  await drainNotifications();
  if (WORK) await rm(WORK, { recursive: true, force: true });
});

describe("config parsing and precedence", () => {
  test("parses command and webhook sinks from project.yaml", async () => {
    await writeFile(
      path.join(ROOT, ".harness", "project.yaml"),
      [
        "schema_version: uh.project.v0",
        "name: notify fixture",
        "notifications:",
        "  sinks:",
        "    - id: capture",
        "      kind: command",
        '      argv: ["echo", "{subject}"]',
        "      events: [run.settled]",
        "    - id: hook",
        "      kind: webhook",
        "      url: https://example.invalid/hook",
        "      headers:",
        "        Authorization: HOOK_TOKEN",
      ].join("\n"),
      "utf8",
    );
    const sinks = await loadNotificationConfig(ROOT, env);
    expect(sinks).toHaveLength(2);
    const capture = sinks.find((sink) => sink.id === "capture")!;
    expect(capture.transport).toBe("command");
    expect(capture.events).toEqual(["run.settled"]);
    const hook = sinks.find((sink) => sink.id === "hook")!;
    expect(hook.transport).toBe("webhook");
    if (hook.transport === "webhook") {
      expect(hook.url).toBe("https://example.invalid/hook");
      expect(hook.method).toBe("POST");
      expect(hook.headers).toEqual([{ name: "Authorization", env: "HOOK_TOKEN" }]);
    }
  });

  test("project entries override user entries with the same id", async () => {
    await writeFile(
      USER_FILE,
      [
        "sinks:",
        "  - id: shared",
        "    kind: command",
        '    argv: ["user", "A"]',
        "  - id: user-only",
        "    kind: command",
        '    argv: ["user", "B"]',
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      path.join(ROOT, ".harness", "project.yaml"),
      [
        "schema_version: uh.project.v0",
        "name: notify fixture",
        "notifications:",
        "  sinks:",
        "    - id: shared",
        "      kind: command",
        '      argv: ["project", "C"]',
      ].join("\n"),
      "utf8",
    );
    const sinks = await loadNotificationConfig(ROOT, env);
    expect(sinks.map((sink) => sink.id).sort()).toEqual(["shared", "user-only"]);
    const shared = sinks.find((sink) => sink.id === "shared")!;
    expect(shared.transport).toBe("command");
    if (shared.transport === "command") expect(shared.argv).toEqual(["project", "C"]);
  });

  test("no configuration resolves to no sinks", async () => {
    expect(await loadNotificationConfig(ROOT, env)).toEqual([]);
  });
});

describe("preset expansion", () => {
  test("hermes expands to a hermes send command reading stdin", () => {
    const sink = resolveSink({ id: "h", preset: "hermes", to: "@owner", events: ["*"] });
    expect(sink.transport).toBe("command");
    if (sink.transport === "command") {
      expect(sink.argv).toEqual(["hermes", "send", "--to", "@owner", "--subject", "{subject}", "--quiet", "--file", "-"]);
      expect(sink.envVar).toBe(DEFAULT_EVENT_ENV);
    }
  });

  test("apprise expands to the documented CLI", () => {
    const sink = resolveSink({ id: "a", preset: "apprise", urls: ["mailto://ops@example.invalid"], events: ["*"] });
    expect(sink.transport).toBe("command");
    if (sink.transport === "command") {
      expect(sink.argv).toEqual(["apprise", "-t", "{subject}", "-b", "-", "mailto://ops@example.invalid"]);
    }
  });

  test("ntfy expands to a POST webhook with a Title header and text body", () => {
    const sink = resolveSink({ id: "n", preset: "ntfy", server: "https://ntfy.sh/", topic: "uh", events: ["*"] });
    expect(sink.transport).toBe("webhook");
    if (sink.transport === "webhook") {
      expect(sink.url).toBe("https://ntfy.sh/uh");
      expect(sink.method).toBe("POST");
      expect(sink.body).toBe("text");
      expect(sink.headers).toEqual([{ name: "Title", value: "{subject}" }]);
    }
  });

  test("windows-toast expands to a PowerShell toast command", () => {
    const sink = expandPreset({ id: "w", preset: "windows-toast" });
    expect(sink.transport).toBe("command");
    if (sink.transport === "command") {
      expect(sink.argv.slice(0, 6)).toEqual(["powershell", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command"]);
      expect(sink.argv[6]).toContain("ToastNotificationManager");
    }
  });

  test("windows-toast is a handoff: its exit status proves nothing about the display", () => {
    const toast = resolveSink({ id: "w", preset: "windows-toast" });
    expect(sinkConfirmation(toast)).toBe("handoff");
    expect(sinkConfirmation(resolveSink({ id: "h", kind: "command", argv: ["true"] }))).toBe("exit-code");
    expect(sinkConfirmation(resolveSink({ id: "n", kind: "webhook", url: "https://example.invalid/x" }))).toBe("http-status");
  });

  test("the toast is raised under the registered Windows PowerShell app id by default", () => {
    const script = windowsToastScript();
    expect(script).toContain(`CreateToastNotifier('${DEFAULT_TOAST_APP_ID}')`);
    expect(script).not.toContain("CreateToastNotifier('Ultimate Harness')");
    expect(DEFAULT_TOAST_APP_ID).toBe("{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe");
  });

  test("app_id overrides the app id the toast is raised under", () => {
    const sink: WindowsToastPresetSink = { id: "w", preset: "windows-toast", app_id: "Contoso.UltimateHarness" };
    const resolved = expandPreset(sink);
    expect(resolved.transport).toBe("command");
    if (resolved.transport === "command") {
      expect(resolved.argv[6]).toContain(`CreateToastNotifier('Contoso.UltimateHarness')`);
      expect(resolved.argv[6]).not.toContain(DEFAULT_TOAST_APP_ID);
      expect(windowsToastScript(sink.app_id)).toBe(resolved.argv[6]);
    }
    const blank = { id: "w", preset: "windows-toast", app_id: "   " } as WindowsToastPresetSink;
    expect(() => expandPreset(blank)).toThrow(/requires "app_id"/);
  });

  test("a config file may set app_id on a windows-toast sink, and it reaches the toast command", () => {
    const parsed = NotificationsSchema.parse({ sinks: [{ id: "w", preset: "windows-toast", app_id: "Contoso.UltimateHarness" }] });
    const resolved = expandPreset(parsed.sinks[0] as WindowsToastPresetSink);
    expect(resolved.transport).toBe("command");
    if (resolved.transport === "command") {
      expect(resolved.argv[6]).toContain(`CreateToastNotifier('Contoso.UltimateHarness')`);
    }
  });

  test("a configured app id cannot break out of its PowerShell literal", () => {
    expect(windowsToastScript("a');b")).toContain("CreateToastNotifier('a'');b')");
    expect(windowsToastScript("a\r\nb")).toContain("CreateToastNotifier('ab')");
    expect(windowsToastScript("a`b")).toContain("CreateToastNotifier('a`b')");
  });

  test("preset options required by the preset are enforced", () => {
    expect(() => resolveSink({ id: "h", preset: "hermes" } as never)).toThrow(/requires "to"/);
    expect(() => resolveSink({ id: "n", preset: "ntfy", server: "https://ntfy.sh" } as never)).toThrow(/requires "server" and "topic"/);
  });
});

describe("matching and filters", () => {
  const sink: ResolvedCommandSink = {
    id: "filtered",
    kind: "command",
    transport: "command",
    argv: ["true"],
    envVar: DEFAULT_EVENT_ENV,
    events: ["run.settled"],
    filter: { statuses: ["failed"], missions: ["wave-*"] },
  };

  test("events list, status filter, and mission glob all gate a match", () => {
    const matching = buildSettlementEvents({ run_id: "r1", mission: "wave-1", runtime: "hermes", status: "failed" })[0];
    expect(sinkMatches(sink, matching)).toBe(true);
    const wrongStatus = buildSettlementEvents({ run_id: "r1", mission: "wave-1", runtime: "hermes", status: "passed" })[0];
    expect(sinkMatches(sink, wrongStatus)).toBe(false);
    const wrongMission = buildSettlementEvents({ run_id: "r1", mission: "other", runtime: "hermes", status: "failed" })[0];
    expect(sinkMatches(sink, wrongMission)).toBe(false);
    const wrongEvent = buildTeamSettledEvent({ run_id: "r1", mission: "wave-1", status: "failed" });
    expect(sinkMatches(sink, wrongEvent)).toBe(false);
  });

  test("a status filter excludes events without a status", () => {
    const noStatus: NotificationEvent = { event: "run.settled", at: NOW, subject: "s", summary: "x", mission: "wave-1" };
    expect(sinkMatches(sink, noStatus)).toBe(false);
  });
});

describe("events", () => {
  test("a normal settlement raises only run.settled", () => {
    const events = buildSettlementEvents({ run_id: "r1", mission: "m", runtime: "hermes", status: "passed" });
    expect(events.map((event) => event.event)).toEqual(["run.settled"]);
  });

  test("a supervision stop code also raises an alert", () => {
    const events = buildSettlementEvents({ run_id: "r1", mission: "m", runtime: "hermes", status: "failed", stop_code: "stall" });
    expect(events.map((event) => event.event)).toEqual(["run.settled", "alert"]);
    expect(events[1].stop_code).toBe("stall");
  });

  test("run.orphaned carries the identity of the lost run", () => {
    const events = buildSettlementEvents({ run_id: "r1", mission: "m", runtime: "hermes", status: "failed", stop_code: "controller_lost" }, { orphaned: true });
    expect(events[0].event).toBe("run.orphaned");
    expect(events[0].run_id).toBe("r1");
    expect(events[1].event).toBe("alert");
  });

  test("elapsedMs tolerates missing or malformed timestamps", () => {
    expect(elapsedMs("2026-09-22T12:00:00.000Z", "2026-09-22T12:00:05.000Z")).toBe(5000);
    expect(elapsedMs(undefined, "2026-09-22T12:00:05.000Z")).toBeUndefined();
    expect(elapsedMs("nope", "2026-09-22T12:00:05.000Z")).toBeUndefined();
  });
});

describe("delivery", () => {
  test("no configuration sends nothing and writes no ledger", async () => {
    const attempts = await dispatchEvent(
      ROOT,
      buildSettlementEvents({ run_id: "r1", mission: "m", runtime: "hermes", status: "failed" })[0],
      { deps: { env } },
    );
    expect(attempts).toEqual([]);
    await expect(readFile(deliveriesPath(ROOT), "utf8")).rejects.toThrow();
  });

  test("a settled run produces one delivery per matching sink", async () => {
    const sinks = [commandSink("one"), commandSink("two")];
    const event = buildSettlementEvents({ run_id: "r1", mission: "m", runtime: "hermes", status: "failed", stop_code: "stall" })[0];
    const attempts = await dispatchEvent(ROOT, event, { sinks, deps: { env } });
    expect(attempts.map((attempt) => attempt.sink).sort()).toEqual(["one", "two"]);
    expect(attempts.every((attempt) => attempt.outcome === "ok")).toBe(true);
    const captured = await readCaptureFile();
    expect(captured.map((entry) => entry.label).sort()).toEqual(["one", "two"]);
    expect(captured[0].message).toBe(event.summary);
    expect(captured[0].event?.event).toBe("run.settled");
  });

  test("each (event, run id, sink) is delivered at most once", async () => {
    const sinks = [commandSink("once")];
    const event = buildSettlementEvents({ run_id: "r1", mission: "m", runtime: "hermes", status: "failed" })[0];
    const first = await dispatchEvent(ROOT, event, { sinks, deps: { env } });
    expect(first).toHaveLength(1);
    const second = await dispatchEvent(ROOT, event, { sinks, deps: { env } });
    expect(second).toEqual([]);
    expect((await readCaptureFile())).toHaveLength(1);
  });

  test("a hanging sink times out without failing or delaying dispatch", async () => {
    const hang = path.join(WORK, "hang.mjs");
    await writeFile(hang, "setTimeout(() => {}, 60000);\n", "utf8");
    const sink: ResolvedCommandSink = {
      id: "hang",
      kind: "command",
      transport: "command",
      argv: [process.execPath, hang],
      envVar: DEFAULT_EVENT_ENV,
      events: ["*"],
    };
    const event = buildSettlementEvents({ run_id: "r1", mission: "m", runtime: "hermes", status: "failed" })[0];
    const started = Date.now();
    const attempts = await dispatchEvent(ROOT, event, { sinks: [sink], deps: { env, timeoutMs: 300 } });
    const elapsed = Date.now() - started;
    expect(attempts[0].outcome).toBe("timeout");
    expect(elapsed).toBeLessThan(5000);
  });

  test("a failing sink records an error outcome without throwing", async () => {
    const fail = path.join(WORK, "fail.mjs");
    await writeFile(fail, "process.exit(3);\n", "utf8");
    const sink: ResolvedCommandSink = {
      id: "fail",
      kind: "command",
      transport: "command",
      argv: [process.execPath, fail],
      envVar: DEFAULT_EVENT_ENV,
      events: ["*"],
    };
    const event = buildSettlementEvents({ run_id: "r1", mission: "m", runtime: "hermes", status: "failed" })[0];
    const attempts = await dispatchEvent(ROOT, event, { sinks: [sink], deps: { env } });
    expect(attempts[0].outcome).toBe("error");
    expect(attempts[0].exit_code).toBe(3);
  });

  test("fire-and-forget settlement never throws and returns immediately", async () => {
    await writeFile(
      USER_FILE,
      [
        "sinks:",
        "  - id: missing",
        "    kind: command",
        '    argv: ["uh-notify-missing-executable"]',
      ].join("\n"),
      "utf8",
    );
    const saved = process.env.UH_NOTIFICATIONS_FILE;
    process.env.UH_NOTIFICATIONS_FILE = USER_FILE;
    try {
      const started = Date.now();
      expect(() => notifyRunSettled(ROOT, { run_id: "r1", mission: "m", runtime: "hermes", status: "failed" })).not.toThrow();
      expect(Date.now() - started).toBeLessThan(2000);
    } finally {
      if (saved === undefined) delete process.env.UH_NOTIFICATIONS_FILE;
      else process.env.UH_NOTIFICATIONS_FILE = saved;
    }
  });

  test("a run settlement sources the files-written count from its run digest", async () => {
    const runDir = path.join(ROOT, ".harness", "missions", "m", "runs", "r1");
    await mkdir(runDir, { recursive: true });
    await writeFile(
      path.join(runDir, "run-digest.json"),
      JSON.stringify({ files_written: { files: ["a.ts", "b.ts", "c.ts"], total: 3 } }),
      "utf8",
    );
    await writeFile(
      USER_FILE,
      [
        "sinks:",
        "  - id: capture",
        "    kind: command",
        `    argv: ['${process.execPath}', '${CAPTURE_SCRIPT}']`,
      ].join("\n"),
      "utf8",
    );
    const savedFile = process.env.UH_NOTIFICATIONS_FILE;
    const savedCapture = process.env.CAPTURE_FILE;
    process.env.UH_NOTIFICATIONS_FILE = USER_FILE;
    process.env.CAPTURE_FILE = CAPTURE_FILE;
    try {
      const loaded = await loadNotificationConfig(ROOT, { ...process.env, UH_NOTIFICATIONS_FILE: USER_FILE });
      expect(loaded).toHaveLength(1);
      notifyRunSettled(ROOT, { run_id: "r1", mission: "m", runtime: "hermes", status: "failed", run_dir: runDir });
      await waitFor(async () => (await readCaptureFile()).some((entry) => entry.event?.files_written === 3));
      const entry = (await readCaptureFile()).find((candidate) => candidate.event?.files_written === 3)!;
      expect(entry.event?.event).toBe("run.settled");
    } finally {
      if (savedFile === undefined) delete process.env.UH_NOTIFICATIONS_FILE;
      else process.env.UH_NOTIFICATIONS_FILE = savedFile;
      if (savedCapture === undefined) delete process.env.CAPTURE_FILE;
      else process.env.CAPTURE_FILE = savedCapture;
    }
  });

  test("a malformed notifications config never fails dispatch", async () => {
    await writeFile(
      path.join(ROOT, ".harness", "project.yaml"),
      [
        "schema_version: uh.project.v0",
        "name: notify fixture",
        "notifications:",
        "  sinks:",
        "    - id: broken",
        "      kind: telepathy",
      ].join("\n"),
      "utf8",
    );
    const event = buildSettlementEvents({ run_id: "r1", mission: "m", runtime: "hermes", status: "failed" })[0];
    await expect(dispatchEvent(ROOT, event, { deps: { env } })).resolves.toEqual([]);
  });
});

describe("webhook delivery", () => {
  let server: Server;
  let port: number;
  let received: Array<{ url: string | undefined; method: string | undefined; headers: Record<string, unknown>; body: string }>;

  beforeEach(async () => {
    received = [];
    server = createServer((request, response) => {
      let body = "";
      request.on("data", (chunk) => { body += chunk; });
      request.on("end", () => {
        received.push({ url: request.url, method: request.method, headers: request.headers, body });
        response.writeHead(200, { "content-type": "text/plain" });
        response.end("ok");
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    port = typeof address === "object" && address !== null ? address.port : 0;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test("header values resolve from environment variable names", async () => {
    const sink: ResolvedWebhookSink = {
      id: "hook",
      kind: "webhook",
      transport: "webhook",
      url: `http://127.0.0.1:${port}/hook`,
      method: "POST",
      headers: [{ name: "Authorization", env: "HOOK_TOKEN" }],
      body: "json",
      events: ["*"],
    };
    const event = buildSettlementEvents({ run_id: "r1", mission: "m", runtime: "hermes", status: "failed" })[0];
    const attempt = await deliverToSink(sink, event, { env: { ...env, HOOK_TOKEN: "Bearer sekret" } });
    expect(attempt.outcome).toBe("ok");
    expect(received).toHaveLength(1);
    expect(received[0].headers["authorization"]).toBe("Bearer sekret");
    expect(JSON.parse(received[0].body).event).toBe("run.settled");
  });

  test("a successful webhook records the status it confirmed", async () => {
    const sink: ResolvedWebhookSink = {
      id: "hook",
      kind: "webhook",
      transport: "webhook",
      url: `http://127.0.0.1:${port}/hook`,
      method: "POST",
      headers: [],
      body: "json",
      events: ["*"],
    };
    const event = buildSettlementEvents({ run_id: "r1", mission: "m", runtime: "hermes", status: "failed" })[0];
    const attempt = await deliverToSink(sink, event, { env });
    expect(attempt.outcome).toBe("ok");
    expect(attempt.confirmation).toBe("http-status");
    expect(attempt.status).toBe(200);
    expect(reportAttempt(attempt)).toEqual({ tag: "OK", message: "HTTP 200 accepted" });
  });

  test("ntfy-style text webhook renders the subject into the Title header", async () => {
    const sink: ResolvedWebhookSink = {
      id: "ntfy",
      kind: "webhook",
      transport: "webhook",
      url: `http://127.0.0.1:${port}/topic`,
      method: "POST",
      headers: [{ name: "Title", value: "{subject}" }],
      body: "text",
      events: ["*"],
    };
    const event = buildSettlementEvents({ run_id: "r1", mission: "m", runtime: "hermes", status: "failed" })[0];
    await deliverToSink(sink, event, { env });
    expect(received[0].headers["title"]).toBe(event.subject);
    expect(received[0].body.trim()).toBe(event.summary);
  });
});

describe("what an attempt confirms", () => {
  const event: NotificationEvent = { event: "notify.test", at: NOW, subject: "UH notify test", summary: "hello", status: "test" };

  function attemptWith(overrides: Partial<DeliveryAttempt>): DeliveryAttempt {
    return { at: NOW, event: "notify.test", sink: "s", transport: "command", outcome: "ok", ...overrides };
  }

  test("a command that exits 0 reports its exit status", async () => {
    const attempts = await dispatchEvent(ROOT, event, { sinks: [commandSink("log")], deps: { env }, ignoreDedupe: true });
    expect(attempts).toHaveLength(1);
    expect(attempts[0].confirmation).toBe("exit-code");
    expect(attempts[0].exit_code).toBe(0);
    expect(reportAttempt(attempts[0])).toEqual({ tag: "OK", message: "exited 0" });
  });

  test("a toast reports a handoff, never a delivery", async () => {
    const toast: ResolvedCommandSink = { ...commandSink("desktop"), confirmation: "handoff" };
    const attempts = await dispatchEvent(ROOT, event, { sinks: [toast], deps: { env }, ignoreDedupe: true });
    expect(attempts[0].outcome).toBe("ok");
    expect(attempts[0].confirmation).toBe("handoff");
    const report = reportAttempt(attempts[0]);
    expect(report.tag).toBe("HANDOFF");
    expect(report.message).toBe("handed to Windows (display cannot be confirmed)");
    expect(report.message).toBe(TOAST_HANDED_OFF_MESSAGE);
  });

  test("the ledger records what each success proved", async () => {
    await dispatchEvent(ROOT, event, { sinks: [commandSink("logged")], deps: { env } });
    const lines = (await readFile(deliveriesPath(ROOT), "utf8")).split("\n").filter((line) => line.trim().length > 0);
    const record = JSON.parse(lines[0]) as DeliveryAttempt;
    expect(record.outcome).toBe("ok");
    expect(record.confirmation).toBe("exit-code");
    expect(record.exit_code).toBe(0);
  });

  test("failures and timeouts are named by what happened", () => {
    expect(reportAttempt(attemptWith({ transport: "command" }))).toEqual({ tag: "OK", message: "exited 0" });
    expect(reportAttempt(attemptWith({ transport: "webhook", status: 204 }))).toEqual({ tag: "OK", message: "HTTP 204 accepted" });
    expect(reportAttempt(attemptWith({ outcome: "error", exit_code: 3 }))).toEqual({ tag: "FAIL", message: "exit code 3" });
    expect(reportAttempt(attemptWith({ outcome: "error", exit_code: 3, detail: "boom" }))).toEqual({ tag: "FAIL", message: "boom" });
    expect(reportAttempt(attemptWith({ transport: "webhook", outcome: "error", status: 500 }))).toEqual({ tag: "FAIL", message: "HTTP 500" });
    expect(reportAttempt(attemptWith({ outcome: "error", detail: "spawn failed: ENOENT" }))).toEqual({ tag: "FAIL", message: "spawn failed: ENOENT" });
    expect(reportAttempt(attemptWith({ outcome: "timeout", detail: "timed out after 15000 ms" }))).toEqual({ tag: "TIMEOUT", message: "timed out after 15000 ms" });
    expect(reportAttempt(attemptWith({ outcome: "timeout" }))).toEqual({ tag: "TIMEOUT", message: "delivery timed out" });
    expect(reportAttempt(attemptWith({ confirmation: "handoff" }))).toEqual({ tag: "HANDOFF", message: TOAST_HANDED_OFF_MESSAGE });
  });
});

describe("detect", () => {
  test("reports a fake hermes on a temporary PATH", async () => {
    const bin = path.join(WORK, "bin");
    await mkdir(bin, { recursive: true });
    await writeFile(path.join(bin, "hermes"), "#!/bin/sh\nexit 0\n", "utf8");
    const detections = await detectPresets({ ...env, PATH: bin, Path: bin, PATHEXT: ".EXE" }, { readToastSetting: async () => "enabled" });
    const hermes = detections.find((detection) => detection.preset === "hermes")!;
    expect(hermes.available).toBe(true);
    expect(hermes.detail).toContain(bin);
    expect(hermes.config).toContain("preset: hermes");
    const apprise = detections.find((detection) => detection.preset === "apprise")!;
    expect(apprise.available).toBe(false);
    const ntfy = detections.find((detection) => detection.preset === "ntfy")!;
    expect(ntfy.available).toBe(true);
    const toast = detections.find((detection) => detection.preset === "windows-toast")!;
    expect(toast.available).toBe(process.platform === "win32");
  });

  test("offers windows-toast under the registered app id where Windows notifications are on", async () => {
    const detections = await detectPresets(env, { platform: "win32", readToastSetting: async () => "enabled" });
    const toast = detections.find((detection) => detection.preset === "windows-toast")!;
    expect(toast.available).toBe(true);
    expect(toast.detail).toContain(DEFAULT_TOAST_APP_ID);
    expect(toast.config).toContain("preset: windows-toast");
    expect(toast.config).not.toContain("app_id");
  });

  test("reports windows-toast unavailable when Windows notifications are turned off", async () => {
    const detections = await detectPresets(env, { platform: "win32", readToastSetting: async () => "disabled" });
    const toast = detections.find((detection) => detection.preset === "windows-toast")!;
    expect(toast.available).toBe(false);
    expect(toast.detail).toContain("notifications are turned off in Windows settings");
    expect(toast.config).toBeUndefined();
  });

  test("never calls toasts unavailable over a setting it could not read, and skips the lookup off Windows", async () => {
    let looked = 0;
    const readToastSetting = async () => { looked += 1; return "unknown" as const; };
    const unreadable = await detectPresets(env, { platform: "win32", readToastSetting });
    expect(unreadable.find((detection) => detection.preset === "windows-toast")!.available).toBe(true);
    expect(looked).toBe(1);
    const linux = await detectPresets(env, { platform: "linux", readToastSetting });
    const toast = linux.find((detection) => detection.preset === "windows-toast")!;
    expect(toast.available).toBe(false);
    expect(toast.detail).toBe("not available on linux");
    expect(looked).toBe(1);
  });

  test("reads the ToastEnabled value out of reg query output", () => {
    const header = "HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\PushNotifications\n";
    expect(parseWindowsToastSetting(`${header}    ToastEnabled    REG_DWORD    0x1\n`)).toBe("enabled");
    expect(parseWindowsToastSetting(`${header}    ToastEnabled    REG_DWORD    0x0\n`)).toBe("disabled");
    expect(parseWindowsToastSetting(`${header}    ToastEnabled    REG_SZ    1\n`)).toBe("enabled");
    expect(parseWindowsToastSetting(`${header}    ToastEnabled    REG_DWORD    0\n`)).toBe("disabled");
    expect(parseWindowsToastSetting(`${header}    SilentLiveView    REG_DWORD    0x1\n`)).toBe("unknown");
    expect(parseWindowsToastSetting("ERROR: The system was unable to find the specified registry key or value.")).toBe("unknown");
    expect(parseWindowsToastSetting(`${header}    ToastEnabled    REG_DWORD    notavalue\n`)).toBe("unknown");
    expect(parseWindowsToastSetting(undefined)).toBe("unknown");
  });

  test("reading this machine's toast setting never fails detection", async () => {
    expect(["enabled", "disabled", "unknown"]).toContain(await readWindowsToastSetting(env));
  });

  test("describeSink surfaces the transport and filters", () => {
    const sink = resolveSink({
      id: "hook",
      kind: "webhook",
      url: "https://example.invalid/x",
      events: ["run.settled"],
      filter: { statuses: ["failed"], missions: ["wave-*"] },
    });
    const description = describeSink(sink);
    expect(description).toContain("[webhook]");
    expect(description).toContain("statuses=failed");
    expect(description).toContain("missions=wave-*");
  });
});
