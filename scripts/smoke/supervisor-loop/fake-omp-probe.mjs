import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const argValue = flag => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const out = event => process.stdout.write(JSON.stringify(event) + "\n");
const probe = process.env.FIXTURE_PROBE ?? "success";
const provider = argValue("--provider") ?? "fixture";
const requestedModel = argValue("--model") ?? "fixture-model";
const model = requestedModel.includes("/") ? requestedModel.slice(requestedModel.indexOf("/") + 1) : requestedModel;
const resumed = args.includes("--resume");
const marker = process.env.FIXTURE_MARKER;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const ready = () => {
  out({ type: "session", id: "supervisor-session" });
  out({ type: "model_request_start", provider, model });
};
const success = () => {
  const content = "```uh-runtime-final-message\ncompleted\n```";
  out({ type: "message_end", message: { role: "assistant", provider, model, content, usage: { input: 1, output: 1, totalTokens: 2 } } });
  out({ type: "agent_end", messages: [{ type: "message", role: "assistant", content }] });
};
const deadlineSuccess = () => {
  mkdirSync(path.join(process.cwd(), "out"), { recursive: true });
  writeFileSync(path.join(process.cwd(), "out", "REPORT.md"), "INCOMPLETE\n\nMissing for the next step\n- Continue verification.\n");
  const content = "INCOMPLETE\n\nMissing for the next step\n- Continue verification.";
  out({ type: "message_end", message: { role: "assistant", provider, model, content, usage: { input: 1, output: 1, totalTokens: 2 } } });
  out({ type: "agent_end", messages: [{ type: "message", role: "assistant", content }] });
};
const toolStart = (toolCallId, toolName, args) => {
  out({ type: "tool_execution_start", toolCallId, toolName, args });
};
const toolEnd = (toolCallId, toolName, result, isError) => {
  out({ type: "tool_execution_end", toolCallId, toolName, result, isError });
};
ready();
if (resumed) {
  out({ type: "turn_start" });
  out({ type: "turn_end" });
  if (probe === "deadline_grace") deadlineSuccess();
  else success();
} else if (probe === "deadline_grace") {
  for (let turn = 0; turn < 4; turn++) {
    out({ type: "turn_start" });
    out({ type: "turn_end" });
  }
  setInterval(() => {}, 1000);
} else if (probe === "denials_budget") {
  for (const target of ["out/a.txt", "out/b.txt", "out/c.txt"]) {
    toolStart(target, "write_file", { path: target });
    toolEnd(target, "write_file", { content: [{ type: "text", text: "CONTRACT: writes are temporarily locked" }] }, true);
  }
  setInterval(() => {}, 1000);
} else if (probe === "fails3") {
  for (let index = 0; index < 3; index++) {
    const id = `failure-${index}`;
    const command = "python out/missing_script.py";
    toolStart(id, "bash", { command });
    toolEnd(id, "bash", { exitCode: 1 }, true);
  }
  setInterval(() => {}, 1000);
} else if (probe === "inflight_stall") {
  toolStart("held", "bash", { command: "sleep" });
  await sleep(Number(process.env.FIXTURE_STALL_MS ?? 300));
  toolEnd("held", "bash", { exitCode: 0 }, false);
  success();
} else if (probe === "stall") {
  setInterval(() => {}, 1000);
} else if (probe === "turncap") {
  for (let turn = 0; turn < 4; turn++) {
    out({ type: "turn_start" });
    out({ type: "turn_end" });
  }
} else if (probe === "tamper") {
  toolStart("tamper", "write_file", { path: ".harness/adapters/oh-my-pi.yaml" });
} else if (probe === "tamper_absolute") {
  toolStart("tamper-absolute", "write_file", {
    path: path.join(process.cwd(), ".harness", "adapters", "oh-my-pi.yaml"),
  });
} else if (probe === "launcher_gone") {
  out({ type: "turn_start" });
  out({ type: "turn_end" });
  await sleep(200);
  if (marker) writeFileSync(marker, "ready\n");
  setInterval(() => {}, 1000);
} else {
  success();
}
