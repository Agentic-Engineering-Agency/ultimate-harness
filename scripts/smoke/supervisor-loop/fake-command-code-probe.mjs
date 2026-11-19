const args = process.argv.slice(2);
const out = event => process.stdout.write(JSON.stringify({ type: "event", event }) + "\n");
const probe = process.env.FIXTURE_PROBE ?? "success";
const resumed = args.includes("--resume");
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const ready = () => {
  out({ type: "session", id: "cc-supervisor-session" });
  out({ type: "model_request_start", model: "fixture/model" });
};
const success = () => {
  const finalText = "```uh-runtime-final-message\ncompleted\n```";
  const usage = { input_tokens: 1, output_tokens: 1, total_tokens: 2 };
  out({ type: "run_end", result: { stopReason: "end_turn", finalText, usage } });
  out({ type: "result", result: { subtype: "success", finalText, usage } });
};
if (resumed) {
  ready();
  success();
} else if (probe === "cc_denials_budget") {
  ready();
  for (const target of ["out/a.txt", "out/b.txt", "out/c.txt"]) {
    out({ type: "tool_queued", toolCallId: target, toolName: "write_file", input: { path: target } });
    out({ type: "tool_hooks", toolCallId: target, toolName: "write_file", phase: "pre", outcome: { kind: "block", text: "writes are temporarily locked" } });
    out({ type: "tool_hook_blocked", toolCallId: target, toolName: "write_file", hookOutput: "writes are temporarily locked" });
  }
  setInterval(() => {}, 1000);
} else if (probe === "cmdc_shell_mutation") {
  ready();
  out({ type: "tool_queued", toolCallId: "cc-shell-mutation", toolName: "shell_command",
    input: { command: "rm .harness/temporary.txt", cwd: process.cwd() } });
  await sleep(1000);
  setInterval(() => {}, 1000);
} else if (probe === "cc_tamper") {
  ready();
  out({ type: "tool_queued", toolCallId: "cc-tamper", toolName: "write_file", input: { path: ".harness/adapters/command-code.yaml" } });
  await sleep(1000);
  setInterval(() => {}, 1000);
} else {
  ready();
  success();
}
