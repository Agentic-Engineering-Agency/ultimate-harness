import { afterEach, expect, test, vi } from "vitest";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { recordAcceptanceDecision } from "../src/harness/decision-receipts.js";
import { validateFile } from "../src/harness/validate.js";

const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function evaluate(response: () => Promise<Response>) {
  const root = await mkdtemp(path.join(tmpdir(), "uh-decision-"));
  roots.push(root);
  vi.stubEnv("TYPESAFE_API_KEY", "synthetic-test-credential");
  vi.stubGlobal("fetch", vi.fn(response));
  const apply = vi.fn(() => "failed");
  const receipt = await recordAcceptanceDecision({
    missionDir: root, missionId: "sample", consumer: "verification", from: "passed",
    state: { contract: { private: "PRIVATE_SOURCE_SENTINEL" } },
    prompt: "PRIVATE_PROMPT_SENTINEL", apply,
  });
  const files = await readdir(path.join(root, "decision-receipts"));
  const file = path.join(root, "decision-receipts", files[0]);
  const stored = await readFile(file, "utf8");
  expect((await validateFile(file)).valid).toBe(true);
  expect(stored).not.toContain("PRIVATE_SOURCE_SENTINEL");
  expect(stored).not.toContain("PRIVATE_PROMPT_SENTINEL");
  expect(stored).not.toContain("synthetic-test-credential");
  expect(JSON.parse(stored)).toEqual(receipt);
  return { receipt, apply, root };
}

test("a consumed remediation recommendation records the real transition without private evidence", async () => {
  const { receipt, apply } = await evaluate(async () => new Response(JSON.stringify({
    model: "test-judge", answers: {
      verdict: { choice: "needs-remediation", confidence: 0.9 }, tamper: { noul: 0 },
    },
  })));
  expect(apply).toHaveBeenCalledOnce();
  expect(receipt).toMatchObject({ status: "applied", provider_status: "available", applied: true,
    human_required: true, state_transition: { from: "passed", to: "failed", unlocked: [] } });
});

test("transport failure records unavailability without invoking the decision consumer", async () => {
  const { receipt, apply } = await evaluate(async () => { throw new Error("PRIVATE_TRANSPORT_SENTINEL"); });
  expect(apply).not.toHaveBeenCalled();
  expect(receipt).toMatchObject({ status: "unavailable", provider_status: "unavailable", applied: false,
    state_transition: { from: "passed", to: "passed", unlocked: [] } });
  expect(JSON.stringify(receipt)).not.toContain("PRIVATE_TRANSPORT_SENTINEL");
});

test("malformed success response cannot reach the decision consumer", async () => {
  const { receipt, apply } = await evaluate(async () => new Response(JSON.stringify({
    answers: { verdict: { choice: "pass", confidence: 0.9 } },
  })));
  expect(apply).not.toHaveBeenCalled();
  expect(receipt).toMatchObject({ status: "malformed", provider_status: "malformed", applied: false, authorizer: "none" });
});
