import { afterEach, expect, test, vi } from "vitest";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { recordAcceptanceDecision } from "../src/harness/decision-receipts.js";
import { validateFile } from "../src/harness/validate.js";
import type { SystemOneState } from "../src/harness/typesafe.js";

/** The provider answers with a versioned id even though the alias `jev-latest` was requested. */
const VERSIONED_MODEL = "jev-2026-09-01";

const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

type Asked = { model: string; questions: Record<string, { type: string }> };

function answersFor(init: RequestInit | undefined, noul: number | ((name: string) => number)): string {
  const { questions } = JSON.parse(String(init?.body)) as Asked;
  const answers: Record<string, unknown> = {};
  for (const [name, question] of Object.entries(questions)) {
    answers[name] = { type: question.type, noul: typeof noul === "number" ? noul : noul(name) };
  }
  return JSON.stringify({ model: VERSIONED_MODEL, answers, usage: { input_tokens: 11, output_tokens: 7 } });
}

const CHANGED: SystemOneState = {
  contract: { private: "PRIVATE_SOURCE_SENTINEL" },
  criteria: [{ id: "ac-1", description: "docs updated", status: "blocked" }],
};
const REMEDIATE = (name: string) => (name.startsWith("criteria[") ? 0.1 : 0.05);

async function evaluate(options: {
  respond: (init: RequestInit | undefined) => Response | Promise<Response>;
  state?: SystemOneState;
  apiKey?: string;
  apply?: () => string;
}) {
  const root = await mkdtemp(path.join(tmpdir(), "uh-decision-"));
  roots.push(root);
  vi.stubEnv("TYPESAFE_API_KEY", options.apiKey ?? "synthetic-test-credential");
  const requests: Asked[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
    requests.push(JSON.parse(String(init?.body)) as Asked);
    return options.respond(init);
  }));
  const apply = vi.fn(options.apply ?? (() => "failed"));
  const receipt = await recordAcceptanceDecision({
    missionDir: root, missionId: "sample", consumer: "verification", from: "passed",
    state: options.state ?? { contract: { private: "PRIVATE_SOURCE_SENTINEL" } },
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
  return { receipt, apply, root, requests };
}

test("a consumed remediation recommendation records the transition, the versioned model and bounded usage", async () => {
  const { receipt, apply, requests } = await evaluate({
    state: CHANGED,
    respond: init => new Response(answersFor(init, REMEDIATE)),
  });

  expect(apply).toHaveBeenCalledOnce();
  expect(requests[0].model).toBe("jev-latest");
  expect(receipt).toMatchObject({
    status: "applied", provider_status: "available", applied: true, authorizer: "jev", human_required: true,
    confidence: 0.8,
    recommendation: { kind: "acceptance", outcome: "needs-remediation" },
    provider: { name: "typesafe", model: VERSIONED_MODEL, usage: { input_tokens: 11, output_tokens: 7 } },
    state_transition: { from: "passed", to: "failed", unlocked: [] },
  });
});

test("a change-free recommendation is recorded as advisory", async () => {
  const { receipt, apply } = await evaluate({
    state: CHANGED,
    respond: init => new Response(answersFor(init, name => (name.startsWith("criteria[") ? 0.6 : 0.05))),
    apply: () => "passed",
  });

  expect(apply).toHaveBeenCalledOnce();
  expect(receipt).toMatchObject({
    status: "advisory", provider_status: "available", applied: false, authorizer: "none",
    recommendation: { kind: "acceptance", outcome: "needs-attention" },
    state_transition: { from: "passed", to: "passed", unlocked: [] },
  });
  expect(receipt.confidence).toBeCloseTo(0.2, 10);
});

test("an answer set with no discriminating signal is recorded as uncertain and never applied", async () => {
  const { receipt, apply } = await evaluate({
    state: CHANGED,
    respond: init => new Response(answersFor(init, 0.5)),
  });

  expect(apply).not.toHaveBeenCalled();
  expect(receipt).toMatchObject({
    status: "uncertain", provider_status: "uncertain", applied: false, authorizer: "none",
    deterministic_fallback: false, confidence: 0,
    state_transition: { from: "passed", to: "passed", unlocked: [] },
  });
});

test("transport failure records unavailability without invoking the decision consumer", async () => {
  const { receipt, apply } = await evaluate({
    respond: async () => { throw new Error("PRIVATE_TRANSPORT_SENTINEL"); },
  });

  expect(apply).not.toHaveBeenCalled();
  expect(receipt).toMatchObject({
    status: "unavailable", provider_status: "unavailable", applied: false, deterministic_fallback: true,
    state_transition: { from: "passed", to: "passed", unlocked: [] },
  });
  expect(JSON.stringify(receipt)).not.toContain("PRIVATE_TRANSPORT_SENTINEL");
});

test("a disabled credential records unavailability without a provider request", async () => {
  const { receipt, apply } = await evaluate({
    apiKey: "",
    respond: init => new Response(answersFor(init, REMEDIATE)),
  });

  expect(apply).not.toHaveBeenCalled();
  expect(receipt).toMatchObject({ status: "unavailable", provider_status: "disabled", applied: false, authorizer: "none" });
});

test("malformed success responses cannot reach the decision consumer", async () => {
  const { receipt, apply } = await evaluate({
    respond: async () => new Response(JSON.stringify({ answers: {} }), { status: 200 }),
  });

  expect(apply).not.toHaveBeenCalled();
  expect(receipt).toMatchObject({ status: "malformed", provider_status: "malformed", applied: false, authorizer: "none" });
});
