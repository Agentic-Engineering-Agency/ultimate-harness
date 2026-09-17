import { test, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse, stringify } from "yaml";
import { initializeHarness } from "../src/harness/init.js";
import { addAdapter } from "../src/harness/adapter-add.js";
import { runCommandCode } from "../src/adapters/command-code.js";
import { prepareRuntimeResume, runWithRuntimeRecovery } from "../src/harness/runtime-recovery.js";

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "uh-native-recovery-"));
  await initializeHarness(root);
  await addAdapter(root, "command-code");
  const manifestPath = path.join(root, ".harness", "adapters", "command-code.yaml");
  const manifest = parse(await readFile(manifestPath, "utf8"));
  manifest.config.cli_command = process.execPath;
  manifest.config.runtime_config = { model: "fixture/model", permission_mode: "yolo", cli_args: [path.join(root, "fixture.cjs")],
    limits: { startup_timeout_ms: 3000, stall_timeout_ms: 200, timeout_ms: 5000 } };
  await writeFile(manifestPath, stringify(manifest));
  const missionPath = path.join(root, ".harness", "missions", "one", "mission.yaml");
  await mkdir(path.dirname(missionPath), { recursive: true });
  await writeFile(missionPath, stringify({ schema_version: "uh.mission.v0", id: "one", title: "Offline recovery", workflow_profile: "research-docs" }));
  await writeFile(path.join(root, "fixture.cjs"), `
    const fs = require('node:fs');
    console.log(JSON.stringify({type:'session',sessionId:'saved-session'}));
    console.log(JSON.stringify({type:'event',event:{type:'model_request_start',model:'fixture/model'}}));
    const resume = process.argv.indexOf('--resume');
    if (resume >= 0) {
      if (process.argv[resume + 1] !== 'saved-session' || fs.readFileSync('kept-output.txt','utf8') !== 'preserved') process.exit(9);
      console.log(JSON.stringify({type:'event',event:{type:'model_request_start',model:'fixture/model'}}));
      console.log(JSON.stringify({type:'result',subtype:'success',sessionId:'saved-session',stopReason:'end_turn',finalText:'Continued existing work'}));
    } else {
      fs.writeFileSync('kept-output.txt','preserved');
      setInterval(() => {}, 1000);
    }
  `);
  return { root, missionPath };
}

test("a stalled attempt settles before a distinct attempt resumes its saved session and outputs", async () => {
  const { root, missionPath } = await fixture();
  try {
    const result = await runWithRuntimeRecovery({ root, missionId: "one", runtime: "command-code", runId: "original",
      recovery: { max_resumes: 1, notes: "Continue from the saved output; do not redo the completed step." },
      run: options => runCommandCode(root, missionPath, { ...options, collectDiff: async () => ({ patch: "" }) }),
    });
    expect(result.result.status).toBe("passed");
    expect(result.runId).not.toBe("original");
    const runDirectory = path.join(root, ".harness", "missions", "one", "runs");
    const index = JSON.parse(await readFile(path.join(runDirectory, "index.json"), "utf8"));
    expect(index.runs.map((run: { run_id: string; status: string; replay_of?: string }) => [run.run_id, run.status, run.replay_of]))
      .toEqual([["original", "failed", undefined], [result.runId, "passed", "original"]]);
    expect(await readFile(path.join(root, "kept-output.txt"), "utf8")).toBe("preserved");
    const originalControlPath = path.join(runDirectory, "original", "runtime-control.json");
    const control = JSON.parse(await readFile(originalControlPath, "utf8"));
    expect(control).toMatchObject({ status: "failed", stop_code: "stall", session_id: "saved-session" });
    // An actual policy stop must never acquire automatic resume authorization.
    control.stop_code = "policy";
    await writeFile(originalControlPath, JSON.stringify(control));
    let admissions = 0;
    await runWithRuntimeRecovery({ root, missionId: "one", runtime: "command-code", runId: "original",
      recovery: { max_resumes: 2, notes: "Synthetic policy gate check" },
      run: async () => { admissions++; return { runId: "original", result: { status: "failed" } }; },
    });
    expect(admissions).toBe(1);
    await expect(prepareRuntimeResume(root, "one", "original", "command-code", "Synthetic policy gate check")).rejects.toThrow();
  } finally { await rm(root, { recursive: true, force: true }); }
}, 15000);
test("a denial budget resumes with a source stop and combined recovery note", async () => {
  const { root, missionPath } = await fixture();
  try {
    const manifestPath = path.join(root, ".harness", "adapters", "command-code.yaml");
    const manifest = parse(await readFile(manifestPath, "utf8"));
    manifest.config.runtime_config.limits.max_denials = 3;
    const denialFixture = path.join(root, "denial-fixture.cjs");
    await writeFile(denialFixture, `
      const out = value => process.stdout.write(JSON.stringify(value) + '\\n');
      out({type:'session', id:'saved-session'});
      out({type:'model_request_start', model:'fixture/model'});
      if (process.argv.includes('--resume')) {
        out({type:'model_request_start', model:'fixture/model'});
        out({type:'result', subtype:'success', sessionId:'saved-session', stopReason:'end_turn', finalText:'Continued'});
      } else {
        for (const target of ['out/a.txt', 'out/b.txt', 'out/c.txt']) {
          const id = target;
          out({type:'tool_queued', toolCallId:id, toolName:'write_file', input:{path:target}});
          out({type:'tool_hooks', toolCallId:id, phase:'pre', outcome:{kind:'block', text:'writes are locked'}});
          out({type:'tool_hook_blocked', toolCallId:id});
        }
        setInterval(() => {}, 1000);
      }
    `);
    manifest.config.runtime_config.cli_args = [denialFixture];
    await writeFile(manifestPath, stringify(manifest));
    const result = await runWithRuntimeRecovery({ root, missionId: "one", runtime: "command-code", runId: "denial",
      recovery: { max_resumes: 1, notes: "Continue from the saved output." },
      run: options => runCommandCode(root, missionPath, { ...options, collectDiff: async () => ({ patch: "" }) }),
    });
    expect(result.result.status).toBe("passed");
    const recoveryPath = path.join(root, ".harness", "missions", "one", "runs", result.runId!, "runtime-recovery.json");
    const recovery = JSON.parse(await readFile(recoveryPath, "utf8"));
    expect(recovery).toMatchObject({
      source_stop_code: "denial_budget",
      source_stop_reason: expect.stringContaining("write_file out/c.txt"),
      notes: expect.stringContaining("You were stopped: 3 hook-denied calls; last: write_file out/c.txt"),
    });
    expect(recovery.notes.match(/You were stopped:/g)).toHaveLength(1);
  } finally { await rm(root, { recursive: true, force: true }); }
}, 15000);
