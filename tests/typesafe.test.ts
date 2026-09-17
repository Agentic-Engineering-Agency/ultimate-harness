import { afterEach, describe, expect, test, vi } from "vitest";
import { evaluateSystemOne, evaluateThreeVerdict } from "../src/harness/typesafe.js";

describe("TypeSafe System One", () => {
  const originalKey = process.env.TYPESAFE_API_KEY;
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = originalKey;
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  test("returns a disabled result without an API key", async () => {
    delete process.env.TYPESAFE_API_KEY;
    await expect(evaluateSystemOne({ state: "x", questions: { ok: { type: "noul" } } }))
      .resolves.toEqual({ enabled: false, reason: "missing_api_key" });
  });

  test("posts the requested state and questions with the environment key", async () => {
    process.env.TYPESAFE_API_KEY = "environment-key";
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      model: "jev-latest",
      answers: { verdict: { type: "choice", choice: "pass", confidence: 0.9, probabilities: { pass: 0.9 } }, tamper: { type: "noul", noul: 0.1 } },
    }), { status: 200 }));
    globalThis.fetch = fetchMock;

    const result = await evaluateThreeVerdict({ contract: { id: "m1" }, outputs: ["ok"] }, "Check evidence");
    expect(result).toMatchObject({ verdict: "pass", confidence: 0.9, tamper: false });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.typesafe.ai/v1/systemone");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer environment-key");
    expect((init?.headers as Record<string, string>)["content-type"]).toBe("application/json");
    expect(JSON.parse(String(init?.body))).toMatchObject({ model: "jev-latest", state: { contract: { id: "m1" } } });
  });

  test("prefers an explicit key and maps remediation plus tamper", async () => {
    process.env.TYPESAFE_API_KEY = "environment-key";
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer explicit-key");
      return new Response(JSON.stringify({ answers: {
        verdict: { type: "choice", choice: "needs-remediation", confidence: 0.8, probabilities: { "needs-remediation": 0.8 } },
        tamper: { type: "noul", noul: 0.75 },
      } }), { status: 200 });
    });
    globalThis.fetch = fetchMock;

    const response = await evaluateSystemOne({ apiKey: "explicit-key", state: {}, questions: { ok: { type: "noul" } } });
    expect(response).toHaveProperty("answers");
    process.env.TYPESAFE_API_KEY = "explicit-key";
    const verdict = await evaluateThreeVerdict({ contract: {} });
    expect(verdict).toMatchObject({ verdict: "needs-remediation", tamper: true });
  });
  test.each([
    { verdict: { choice: "pass", confidence: 0.9 } },
    { verdict: { choice: "pass", confidence: 2 }, tamper: { noul: 0 } },
    { verdict: { choice: "pass" }, tamper: { noul: 0 } },
    { verdict: { choice: "pass", confidence: 0.9 }, tamper: { noul: -1 } },
  ])("rejects malformed safety judgments rather than treating them as a pass", async answers => {
    process.env.TYPESAFE_API_KEY = "test-key";
    globalThis.fetch = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ answers }), { status: 200 }));
    await expect(evaluateThreeVerdict({ contract: {} })).rejects.toThrow();
  });
});
