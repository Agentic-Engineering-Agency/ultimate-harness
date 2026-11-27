import { afterEach, describe, expect, test, vi } from "vitest";
import { DEFAULT_TYPESAFE_MODEL, REPORT_QUESTIONS, composeThreeVerdict, evaluateSystemOne, evaluateThreeVerdict,
  type Question, type SystemOneState } from "../src/harness/typesafe.js";

/** The provider answers with a versioned id even though the alias `jev-latest` was requested. */
const VERSIONED_MODEL = "jev-2026-09-01";
const noDelay = async () => {};

type CapturedBody = {
  model: string;
  state: Record<string, unknown>;
  questions: Record<string, { type: string; instructions?: string; criteria?: unknown }>;
};

function bodyOf(init?: RequestInit): CapturedBody {
  return JSON.parse(String(init?.body)) as CapturedBody;
}

function answersFor(body: CapturedBody, noul: number | ((name: string) => number), model = VERSIONED_MODEL): string {
  const answers: Record<string, unknown> = {};
  for (const [name, question] of Object.entries(body.questions)) {
    answers[name] = { type: question.type, noul: typeof noul === "number" ? noul : noul(name) };
  }
  return JSON.stringify({ model, answers, usage: { input_tokens: 11, output_tokens: 7 } });
}

const respondWith = (noul: number | ((name: string) => number)): typeof fetch =>
  vi.fn<typeof fetch>(async (_input, init) => new Response(answersFor(bodyOf(init), noul), { status: 200 }));

describe("TypeSafe System One transport", () => {
  const originalKey = process.env.TYPESAFE_API_KEY;
  const originalModel = process.env.UH_TYPESAFE_MODEL;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.UH_TYPESAFE_MODEL;
    else process.env.UH_TYPESAFE_MODEL = originalModel;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("sends one bounded request and returns the validated versioned answer", async () => {
    process.env.TYPESAFE_API_KEY = "environment-key";
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(answersFor(bodyOf(init), 0.9), { status: 200 });
    });

    const result = await evaluateSystemOne({
      state: { contract: { id: "m1" } },
      questions: { "criterion-1": { type: "noul" } },
      fetch: fetchMock,
      delay: noDelay,
    });

    expect(capturedUrl).toBe("https://api.typesafe.ai/v1/systemone");
    expect((capturedInit?.headers as Record<string, string>).Authorization).toBe("Bearer environment-key");
    expect((capturedInit?.headers as Record<string, string>)["content-type"]).toBe("application/json");
    const body = bodyOf(capturedInit);
    expect(body.model).toBe(DEFAULT_TYPESAFE_MODEL);
    expect(body.state).toEqual({ contract: { id: "m1" } });
    expect(Object.keys(body.questions)).toEqual(["criterion-1"]);
    expect(result).toMatchObject({
      kind: "ok",
      model: VERSIONED_MODEL,
      answers: { "criterion-1": { noul: 0.9 } },
      usage: { input_tokens: 11, output_tokens: 7 },
    });
    expect(result.kind === "ok" && result.latency_ms >= 0).toBe(true);
  });

  test("resolves the requested model from the option, then UH_TYPESAFE_MODEL, then the default", async () => {
    process.env.TYPESAFE_API_KEY = "environment-key";
    const models: string[] = [];
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
      const body = bodyOf(init);
      models.push(body.model);
      return new Response(answersFor(body, 0.9), { status: 200 });
    });

    delete process.env.UH_TYPESAFE_MODEL;
    await evaluateSystemOne({ state: {}, questions: { q: { type: "noul" } }, fetch: fetchMock, delay: noDelay });
    process.env.UH_TYPESAFE_MODEL = "jev-2026-01-01";
    await evaluateSystemOne({ state: {}, questions: { q: { type: "noul" } }, fetch: fetchMock, delay: noDelay });
    await evaluateSystemOne({ state: {}, questions: { q: { type: "noul" } }, model: "jev-pinned", fetch: fetchMock, delay: noDelay });

    expect(models).toEqual([DEFAULT_TYPESAFE_MODEL, "jev-2026-01-01", "jev-pinned"]);
  });

  test("returns disabled without a key and never contacts the provider", async () => {
    delete process.env.TYPESAFE_API_KEY;
    const fetchMock = vi.fn<typeof fetch>(async () => new Response("{}", { status: 200 }));

    await expect(evaluateSystemOne({ state: {}, questions: { q: { type: "noul" } }, fetch: fetchMock }))
      .resolves.toEqual({ kind: "disabled" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("enforces timeoutMs with AbortSignal.timeout and does not retry a timeout", async () => {
    process.env.TYPESAFE_API_KEY = "environment-key";
    const fetchMock = vi.fn<typeof fetch>((_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "TimeoutError")));
    }));

    await expect(evaluateSystemOne({ state: {}, questions: { q: { type: "noul" } }, timeoutMs: 5, fetch: fetchMock, delay: noDelay }))
      .resolves.toEqual({ kind: "unavailable", reason: "timeout" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("times out even when the transport ignores the abort signal", async () => {
    process.env.TYPESAFE_API_KEY = "environment-key";
    const fetchMock = vi.fn<typeof fetch>(() => new Promise<Response>(() => {}));

    await expect(evaluateSystemOne({ state: {}, questions: { q: { type: "noul" } }, timeoutMs: 5, fetch: fetchMock, delay: noDelay }))
      .resolves.toEqual({ kind: "unavailable", reason: "timeout" });
  });

  test("retries 429 honoring a numeric retry-after header in seconds", async () => {
    process.env.TYPESAFE_API_KEY = "environment-key";
    const delays: number[] = [];
    let calls = 0;
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
      calls += 1;
      return calls === 1
        ? new Response("slow down", { status: 429, headers: { "retry-after": "1" } })
        : new Response(answersFor(bodyOf(init), 0.9), { status: 200 });
    });

    const result = await evaluateSystemOne({ state: {}, questions: { q: { type: "noul" } }, fetch: fetchMock, delay: async (ms) => { delays.push(ms); } });

    expect(result.kind).toBe("ok");
    expect(calls).toBe(2);
    expect(delays).toEqual([1000]);
  });

  test("caps an oversized retry-after at five seconds", async () => {
    process.env.TYPESAFE_API_KEY = "environment-key";
    const delays: number[] = [];
    let calls = 0;
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
      calls += 1;
      return calls === 1
        ? new Response("slow down", { status: 429, headers: { "retry-after": "42" } })
        : new Response(answersFor(bodyOf(init), 0.9), { status: 200 });
    });

    await evaluateSystemOne({ state: {}, questions: { q: { type: "noul" } }, fetch: fetchMock, delay: async (ms) => { delays.push(ms); } });
    expect(delays).toEqual([5000]);
  });

  test("falls back to the default backoff when retry-after is not numeric seconds", async () => {
    process.env.TYPESAFE_API_KEY = "environment-key";
    const delays: number[] = [];
    let calls = 0;
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
      calls += 1;
      return calls === 1
        ? new Response("slow down", { status: 429, headers: { "retry-after": "Wed, 21 Oct 2015 07:28:00 GMT" } })
        : new Response(answersFor(bodyOf(init), 0.9), { status: 200 });
    });

    await evaluateSystemOne({ state: {}, questions: { q: { type: "noul" } }, fetch: fetchMock, delay: async (ms) => { delays.push(ms); } });
    expect(delays).toEqual([250]);
  });

  test("falls back to 250 ms then 1000 ms and gives up after three retryable attempts", async () => {
    process.env.TYPESAFE_API_KEY = "environment-key";
    const delays: number[] = [];
    const fetchMock = vi.fn<typeof fetch>(async () => new Response("busy", { status: 529 }));

    const result = await evaluateSystemOne({ state: {}, questions: { q: { type: "noul" } }, fetch: fetchMock, delay: async (ms) => { delays.push(ms); } });

    expect(result).toEqual({ kind: "unavailable", reason: "http", status: 529 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(delays).toEqual([250, 1000]);
  });

  test("does not retry a non-retryable status", async () => {
    process.env.TYPESAFE_API_KEY = "environment-key";
    const delays: number[] = [];
    const fetchMock = vi.fn<typeof fetch>(async () => new Response("nope", { status: 500 }));

    await expect(evaluateSystemOne({ state: {}, questions: { q: { type: "noul" } }, fetch: fetchMock, delay: async (ms) => { delays.push(ms); } }))
      .resolves.toEqual({ kind: "unavailable", reason: "http", status: 500 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(delays).toEqual([]);
  });

  test("never throws for provider conditions", async () => {
    process.env.TYPESAFE_API_KEY = "environment-key";
    const questions = { q: { type: "noul" } as Question };

    await expect(evaluateSystemOne({ state: {}, questions, fetch: async () => { throw new Error("socket hang up"); }, delay: noDelay }))
      .resolves.toEqual({ kind: "unavailable", reason: "transport" });
    await expect(evaluateSystemOne({ state: {}, questions, fetch: async () => new Response("not json", { status: 200 }), delay: noDelay }))
      .resolves.toEqual({ kind: "malformed", reason: "invalid_json" });
    await expect(evaluateSystemOne({ state: {}, questions, fetch: async () => new Response(JSON.stringify({ model: "m", answers: {} }), { status: 200 }), delay: noDelay }))
      .resolves.toEqual({ kind: "malformed", reason: "invalid_envelope" });
    await expect(evaluateSystemOne({ state: {}, questions, fetch: async () => new Response(JSON.stringify({ answers: { q: { noul: 0.9 } } }), { status: 200 }), delay: noDelay }))
      .resolves.toEqual({ kind: "malformed", reason: "invalid_envelope" });
  });

  test.each([
    { name: "a Noul above one", question: { type: "noul" } as Question, answer: { noul: 1.5 } },
    { name: "a negative Noul", question: { type: "noul" } as Question, answer: { noul: -0.1 } },
    { name: "a missing Noul", question: { type: "noul" } as Question, answer: { score: 1 } },
    { name: "a choice outside the declared options", question: { type: "choice", criteria: { pass: "a", fail: "b" } } as Question, answer: { choice: "maybe", probabilities: { pass: 0.5, fail: 0.5 } } },
    { name: "probabilities that are not exactly the declared options", question: { type: "choice", criteria: { pass: "a", fail: "b" } } as Question, answer: { choice: "pass", probabilities: { pass: 1 } } },
    { name: "a score outside the level range", question: { type: "score", criteria: ["low", "mid", "high"] } as Question, answer: { score: 3 } },
  ])("rejects $name as an invalid envelope", async ({ question, answer }) => {
    process.env.TYPESAFE_API_KEY = "environment-key";
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ model: VERSIONED_MODEL, answers: { q: answer } }), { status: 200 }));

    await expect(evaluateSystemOne({ state: {}, questions: { q: question }, fetch: fetchMock, delay: noDelay }))
      .resolves.toEqual({ kind: "malformed", reason: "invalid_envelope" });
  });

  test("accepts a choice inside its declared options and a score inside the level range", async () => {
    process.env.TYPESAFE_API_KEY = "environment-key";
    const questions: Record<string, Question> = {
      q1: { type: "choice", criteria: { pass: "a", fail: "b" } },
      q2: { type: "score", criteria: ["low", "mid", "high"] },
    };
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      model: VERSIONED_MODEL,
      answers: { q1: { choice: "pass", probabilities: { pass: 0.9, fail: 0.1 } }, q2: { score: 2 } },
    }), { status: 200 }));

    const result = await evaluateSystemOne({ state: {}, questions, fetch: fetchMock, delay: noDelay });
    expect(result).toMatchObject({ kind: "ok", answers: { q1: { choice: "pass" }, q2: { score: 2 } } });
  });
});

describe("three-verdict composition", () => {
  test.each([
    { name: "a deterministic failure dominating a confident model pass", deterministicFailure: true, criterionNouls: [0.99], reportNouls: [0.01], expected: "needs-remediation" },
    { name: "a criterion below the remediation threshold", deterministicFailure: false, criterionNouls: [0.49], reportNouls: [0.01], expected: "needs-remediation" },
    { name: "no criteria at all", deterministicFailure: false, criterionNouls: [], reportNouls: [0.01], expected: "needs-attention" },
    { name: "no criteria with a deterministic failure", deterministicFailure: true, criterionNouls: [], reportNouls: [0.01], expected: "needs-remediation" },
    { name: "every criterion exactly at the pass threshold", deterministicFailure: false, criterionNouls: [0.8, 0.95], reportNouls: [0.01], expected: "pass" },
    { name: "a criterion between the thresholds", deterministicFailure: false, criterionNouls: [0.79], reportNouls: [0.01], expected: "needs-attention" },
    { name: "a report flag below the pass threshold", deterministicFailure: false, criterionNouls: [0.99], reportNouls: [0.5], expected: "needs-attention" },
  ])("composes $name", ({ deterministicFailure, criterionNouls, reportNouls, expected }) => {
    expect(composeThreeVerdict({ deterministicFailure, criterionNouls, reportNouls })).toBe(expected);
  });
});

describe("evaluateThreeVerdict", () => {
  const originalKey = process.env.TYPESAFE_API_KEY;
  afterEach(() => {
    if (originalKey === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = originalKey;
  });

  const BLOCKED: SystemOneState = {
    contract: { acceptance_criteria: [] },
    criteria: [
      { id: "ac-1", description: "docs updated", status: "blocked" },
      { id: "ac-2", description: "tests added", status: "passed" },
      { id: "ac-3", description: "build green", status: "failed", exit_code: 1 },
    ],
    tamper: false,
  };

  test("asks one Noul per non-deterministic criterion and no tamper question", async () => {
    process.env.TYPESAFE_API_KEY = "environment-key";
    let body: CapturedBody | undefined;
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
      body = bodyOf(init);
      return new Response(answersFor(bodyOf(init), 0.99), { status: 200 });
    });

    const result = await evaluateThreeVerdict(BLOCKED, "Assess the supplied disposition.", { fetch: fetchMock, delay: noDelay });

    const asked = body!;
    expect(Object.keys(asked.questions)).toEqual([
      "criteria[0]",
      REPORT_QUESTIONS.work_incomplete,
      REPORT_QUESTIONS.names_blocker,
      REPORT_QUESTIONS.claims_failed_check_passed,
    ]);
    expect(asked.questions["criteria[0]"]).toMatchObject({ type: "noul" });
    expect(String(asked.questions["criteria[0]"]?.instructions)).toContain("`criteria[0]`");
    expect(JSON.stringify(asked.questions)).not.toContain("tamper");
    expect(Object.keys(asked.questions)).toHaveLength(4);
    // ac-3 failed deterministically, so its confident model pass cannot win.
    expect(result).toMatchObject({ kind: "ok", verdict: "needs-remediation", tamper: false, model: VERSIONED_MODEL });
  });

  test("composes pass and confidence from the asked Nouls only", async () => {
    process.env.TYPESAFE_API_KEY = "environment-key";
    const state: SystemOneState = { contract: {}, criteria: [{ id: "ac-1", description: "docs", status: "blocked" }] };

    const pass = await evaluateThreeVerdict(state, undefined, {
      fetch: respondWith((name) => (name.startsWith("criteria[") ? 0.9 : 0.1)),
      delay: noDelay,
    });
    expect(pass).toMatchObject({ kind: "ok", verdict: "pass" });
    expect(pass.kind === "ok" && pass.confidence).toBeCloseTo(0.8, 10);

    const attention = await evaluateThreeVerdict(state, undefined, {
      fetch: respondWith((name) => (name.startsWith("criteria[") ? 0.6 : 0.1)),
      delay: noDelay,
    });
    expect(attention).toMatchObject({ kind: "ok", verdict: "needs-attention" });
    expect(attention.kind === "ok" && attention.confidence).toBeCloseTo(0.2, 10);
  });

  test("takes tamper from the deterministic state and defaults to false", async () => {
    process.env.TYPESAFE_API_KEY = "environment-key";

    // No criteria at all: the model answers only the report battery, so the
    // verdict over no criterion is non-discriminating and never a pass.
    const clean = await evaluateThreeVerdict({ contract: {} }, undefined, { fetch: respondWith(0.1), delay: noDelay });
    expect(clean).toMatchObject({
      kind: "ok", tamper: false, verdict: "needs-attention", confidence: 0, criteria_judged: 0, deterministic_failure: false,
    });

    const flagged = await evaluateThreeVerdict({ contract: {}, tamper: true }, undefined, { fetch: respondWith(0.1), delay: noDelay });
    expect(flagged).toMatchObject({ kind: "ok", tamper: true });
  });

  test("never passes and reports zero confidence when no criterion is asked", async () => {
    process.env.TYPESAFE_API_KEY = "environment-key";

    // Low report answers used to yield a confident vacuous `pass`; with no
    // criterion judged the confidence must be 0 and the verdict non-passing.
    const result = await evaluateThreeVerdict({ contract: {} }, undefined, {
      fetch: respondWith((name) => (name.startsWith("criteria[") ? 0.9 : 0)),
      delay: noDelay,
    });

    expect(result).toMatchObject({
      kind: "ok", verdict: "needs-attention", confidence: 0, criteria_judged: 0, deterministic_failure: false,
    });
  });

  test("a caller-supplied deterministic failure is authoritative with no criteria", async () => {
    process.env.TYPESAFE_API_KEY = "environment-key";

    const result = await evaluateThreeVerdict({ contract: {}, deterministicFailure: true }, undefined, {
      fetch: respondWith(0.99),
      delay: noDelay,
    });

    expect(result).toMatchObject({
      kind: "ok", verdict: "needs-remediation", confidence: 0, criteria_judged: 0, deterministic_failure: true,
    });
  });

  test("the independent-review projection asks no criterion, so its judgment cannot pass", async () => {
    process.env.TYPESAFE_API_KEY = "environment-key";
    // The shape `collectIndependentReview` builds: sources and a review
    // recommendation, but no `criteria`, so only the report battery is asked.
    const reviewState: SystemOneState = {
      contract: { human_acceptance_required: true, sources: [{ index: 0, acceptance: [], checks: [] }] },
      outputs: { recommendation: "pass", sources: [{ index: 0, verdict: "pass" }] },
    };

    const result = await evaluateThreeVerdict(reviewState, "Assess the review disposition.", {
      fetch: respondWith(0),
      delay: noDelay,
    });

    expect(result).toMatchObject({
      kind: "ok", verdict: "needs-attention", confidence: 0, criteria_judged: 0, deterministic_failure: false,
    });
  });

  test("returns provider conditions instead of throwing", async () => {
    process.env.TYPESAFE_API_KEY = "environment-key";

    await expect(evaluateThreeVerdict({ contract: {} }, undefined, {
      fetch: async () => { throw new Error("socket hang up"); },
      delay: noDelay,
    })).resolves.toEqual({ kind: "unavailable", reason: "transport" });
    await expect(evaluateThreeVerdict({ contract: {} }, undefined, {
      fetch: async () => new Response("{", { status: 200 }),
      delay: noDelay,
    })).resolves.toEqual({ kind: "malformed", reason: "invalid_json" });
  });

  test("returns disabled without a provider credential", async () => {
    delete process.env.TYPESAFE_API_KEY;
    await expect(evaluateThreeVerdict({ contract: {} })).resolves.toEqual({ kind: "disabled" });
  });
});
