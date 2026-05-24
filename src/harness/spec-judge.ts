import { z } from "zod";
import type { LoadedSpec } from "./spec-loader.js";

/**
 * UH-110 — LLM spec-adherence judge.
 *
 * Pure scaffolding: build a judge prompt from a spec + an implementation diff,
 * and parse a structured verdict back. The model call itself is injected
 * (`JudgeRunner`) so this module is deterministic and unit-testable; the CLI
 * wires a real one-shot dispatch (hermes-proxy) behind `uh validate --judge`.
 */

export const JudgeVerdictSchema = z
  .object({
    adherence: z.enum(["pass", "partial", "fail"]),
    missing_ac: z.array(z.string()).default([]),
    evidence: z.string().default(""),
  })
  .strip();
export type JudgeVerdict = z.infer<typeof JudgeVerdictSchema>;

export type JudgeRunner = (prompt: string) => Promise<string>;

export function buildJudgePrompt(spec: LoadedSpec, diff: string): string {
  const acLines = spec.acceptanceCriteria
    .map((ac, i) => `${i + 1}. [${ac.id}] ${ac.description}`)
    .join("\n");
  return [
    "You are a strict spec-adherence judge. Decide whether the implementation",
    "diff satisfies the specification's acceptance criteria.",
    "",
    "Respond with ONLY a JSON object (no prose, no code fence) of the shape:",
    '{"adherence":"pass|partial|fail","missing_ac":["<unsatisfied AC text>"],"evidence":"<1-2 sentences citing the diff>"}',
    "",
    `# Spec ${spec.frontMatter.id} — ${spec.frontMatter.title}`,
    "",
    "## Goal",
    spec.goal,
    "",
    "## Acceptance criteria",
    acLines,
    "",
    "# Implementation diff",
    "```diff",
    diff.length > 0 ? diff : "(empty diff)",
    "```",
  ].join("\n");
}

/** Extract + validate a verdict from raw model output (tolerates fences/prose). */
export function parseJudgeVerdict(raw: string): JudgeVerdict {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("judge verdict contained no JSON object");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch (err) {
    throw new Error(`judge verdict was not valid JSON: ${(err as Error).message}`);
  }
  const result = JudgeVerdictSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`judge verdict failed schema validation: ${result.error.issues.map((i) => i.message).join("; ")}`);
  }
  return result.data;
}

/** Minimal OpenAI-compatible one-shot completion (used to dispatch the judge). */
export async function oneShotOpenAI(opts: {
  endpoint: string;
  model: string;
  prompt: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<string> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const url = `${opts.endpoint.replace(/\/$/, "")}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60_000);
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: opts.model,
        messages: [{ role: "user", content: opts.prompt }],
        temperature: 0,
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`judge model HTTP ${res.status}`);
    const json = (await res.json()) as Record<string, unknown>;
    const choices = json.choices;
    if (Array.isArray(choices) && choices.length > 0 && typeof choices[0] === "object" && choices[0]) {
      const msg = (choices[0] as Record<string, unknown>).message as Record<string, unknown> | undefined;
      if (msg && typeof msg.content === "string") return msg.content;
    }
    throw new Error("judge model response had no message content");
  } finally {
    clearTimeout(timer);
  }
}

export async function judgeSpecAdherence(args: {
  spec: LoadedSpec;
  diff: string;
  runner: JudgeRunner;
}): Promise<JudgeVerdict> {
  const prompt = buildJudgePrompt(args.spec, args.diff);
  const raw = await args.runner(prompt);
  return parseJudgeVerdict(raw);
}
