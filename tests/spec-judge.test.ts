import { describe, expect, test } from "vitest";
import {
  buildJudgePrompt,
  judgeSpecAdherence,
  oneShotOpenAI,
  parseJudgeVerdict,
} from "../src/harness/spec-judge.js";
import { parseSpecContent } from "../src/harness/spec-loader.js";

const SPEC = parseSpecContent(
  `---
schema: uh.spec.v0
id: UH-110
title: Adherence judge
status: draft
owners: [LaloLalo1999]
linear: UH-110
---

## Goal

Grade whether a diff satisfies a spec.

## Non-goals

- Running the model in this module.

## Acceptance criteria

1. Builds a prompt containing the diff.
2. Parses a structured verdict.

## Risks

- Model returns prose.

## Open questions

- none
`,
  "judge.spec.md",
);

describe("buildJudgePrompt", () => {
  test("includes spec id, goal, acceptance criteria and the diff", () => {
    const p = buildJudgePrompt(SPEC, "diff --git a/x b/x\n+hello");
    expect(p).toContain("UH-110");
    expect(p).toContain("Grade whether a diff satisfies a spec.");
    expect(p).toContain("Builds a prompt containing the diff.");
    expect(p).toContain("+hello");
  });

  test("handles an empty diff", () => {
    expect(buildJudgePrompt(SPEC, "")).toContain("(empty diff)");
  });
});

describe("parseJudgeVerdict", () => {
  test("parses a bare JSON verdict", () => {
    const v = parseJudgeVerdict('{"adherence":"pass","missing_ac":[],"evidence":"all covered"}');
    expect(v).toEqual({ adherence: "pass", missing_ac: [], evidence: "all covered" });
  });

  test("extracts JSON from fenced / prose-wrapped output", () => {
    const v = parseJudgeVerdict('Here is my verdict:\n```json\n{"adherence":"partial","missing_ac":["AC2"],"evidence":"x"}\n```\n');
    expect(v.adherence).toBe("partial");
    expect(v.missing_ac).toEqual(["AC2"]);
  });

  test("defaults missing_ac/evidence", () => {
    expect(parseJudgeVerdict('{"adherence":"fail"}')).toEqual({ adherence: "fail", missing_ac: [], evidence: "" });
  });

  test("throws on no JSON / invalid enum", () => {
    expect(() => parseJudgeVerdict("no json here")).toThrow(/no JSON/);
    expect(() => parseJudgeVerdict('{"adherence":"maybe"}')).toThrow(/schema/);
  });
});

describe("judgeSpecAdherence", () => {
  test("runs the injected runner with the prompt and parses its output", async () => {
    let seen = "";
    const v = await judgeSpecAdherence({
      spec: SPEC,
      diff: "+console.log(1)",
      runner: async (prompt) => {
        seen = prompt;
        return '{"adherence":"pass","missing_ac":[],"evidence":"ok"}';
      },
    });
    expect(seen).toContain("+console.log(1)");
    expect(v.adherence).toBe("pass");
  });
});

describe("oneShotOpenAI", () => {
  function fetchReturning(body: unknown, ok = true): typeof fetch {
    return (async () => ({ ok, status: ok ? 200 : 500, json: async () => body }) as unknown as Response) as unknown as typeof fetch;
  }

  test("returns choices[0].message.content", async () => {
    const out = await oneShotOpenAI({
      endpoint: "http://proxy.test",
      model: "m",
      prompt: "p",
      fetchImpl: fetchReturning({ choices: [{ message: { content: "verdict text" } }] }),
    });
    expect(out).toBe("verdict text");
  });

  test("throws on non-200", async () => {
    await expect(
      oneShotOpenAI({ endpoint: "http://proxy.test", model: "m", prompt: "p", fetchImpl: fetchReturning({}, false) }),
    ).rejects.toThrow(/HTTP 500/);
  });

  test("throws when no message content", async () => {
    await expect(
      oneShotOpenAI({ endpoint: "http://proxy.test", model: "m", prompt: "p", fetchImpl: fetchReturning({ choices: [] }) }),
    ).rejects.toThrow(/no message content/);
  });
});
