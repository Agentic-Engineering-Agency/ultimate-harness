// Deterministic stand-in for `omp --print --mode json`, used only by the resource-wave smoke.
// It emits the native event shapes the oh-my-pi adapter reads: route attestation, usage, final sentinel.
// FIXTURE_COST: cost total per worker as a number, or "none" to omit cost (unknown cost).
// FIXTURE_SLEEP_MS: how long a worker "works", so waves are observable.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const out = (o) => process.stdout.write(JSON.stringify(o) + "\n");
const args = process.argv.slice(2);
const argValue = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const provider = argValue("--provider", "fixture");
const requestedModel = argValue("--model", "fixture-model");
const model = requestedModel.includes("/") ? requestedModel.slice(requestedModel.indexOf("/") + 1) : requestedModel;
const costMode = process.env.FIXTURE_COST ?? "0.5";
const sleepMs = Number(process.env.FIXTURE_SLEEP_MS ?? "1500");
const worker = path.basename(process.cwd());

out({ type: "session", id: `fx-${process.pid}` });
out({ type: "model_request_start", provider, model });
mkdirSync("out", { recursive: true });
writeFileSync(path.join("out", `answer-${worker}.txt`), `42 from ${worker}\n`);
await new Promise((r) => setTimeout(r, sleepMs));
const usage = { input: 10, output: 5, totalTokens: 15 };
if (costMode !== "none") usage.cost = { total: Number(costMode) };
const content = "```uh-runtime-final-message\nwrote out/answer-" + worker + ".txt\n```";
out({ type: "message_end", message: { role: "assistant", provider, model, content, usage } });
out({ type: "agent_end", messages: [{ role: "assistant", content, usage }] });
