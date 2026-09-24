import { z } from "zod";

export const TYPESAFE_SYSTEM_ONE_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
export const DEFAULT_TYPESAFE_MODEL = "jev-latest";
export const DEFAULT_TYPESAFE_TIMEOUT_MS = 10_000;
/** Attempts including the first; only 429 and 529 responses are retried. */
export const TYPESAFE_MAX_ATTEMPTS = 3;
/** Backoff before attempt 2 and attempt 3 when the response carries no numeric `retry-after`. */
export const TYPESAFE_RETRY_DELAYS_MS: readonly number[] = [250, 1000];
/** `retry-after` is read in seconds and capped so a hostile header cannot stall verification. */
export const TYPESAFE_RETRY_AFTER_CAP_SECONDS = 5;

/**
 * Composition thresholds. These are harness policy, never model output: a
 * per-criterion Noul below `REMEDIATION_THRESHOLD` fails its criterion, at or
 * above `PASS_THRESHOLD` it satisfies it, and a report Noul at or above
 * `REPORT_FLAG_THRESHOLD` raises a report flag that blocks a pass.
 */
export const REMEDIATION_THRESHOLD = 0.5;
export const PASS_THRESHOLD = 0.8;
export const REPORT_FLAG_THRESHOLD = 0.5;

const RETRYABLE_STATUSES: readonly number[] = [429, 529];

/** The fixed report battery: atomic Nouls about the report itself, always asked. */
export const REPORT_QUESTIONS = {
  work_incomplete: "report_work_incomplete",
  names_blocker: "report_names_blocker",
  claims_failed_check_passed: "report_claims_failed_check_passed",
} as const;
export const REPORT_QUESTION_NAMES: readonly string[] = Object.values(REPORT_QUESTIONS);

export type NoulQuestion = {
  type: "noul";
  instructions?: unknown;
  criteria?: { true?: unknown; false?: unknown } | null;
};

export type ChoiceQuestion = {
  type: "choice";
  instructions?: unknown;
  criteria: Record<string, unknown>;
};

export type ScoreQuestion = {
  type: "score";
  instructions?: unknown;
  criteria: unknown[];
};

export type Question = NoulQuestion | ChoiceQuestion | ScoreQuestion;

export type TypeSafeAnswer = {
  noul?: number;
  choice?: string;
  probabilities?: Record<string, number>;
  score?: number;
};

export type TypeSafeUsage = {
  input_tokens: number;
  output_tokens: number;
};

export type SystemOneDisabled = { kind: "disabled" };

export type SystemOneUnavailable = {
  kind: "unavailable";
  reason: "timeout" | "transport" | "http";
  status?: number;
};

export type SystemOneMalformed = {
  kind: "malformed";
  reason: "invalid_json" | "invalid_envelope";
};

export type SystemOneOk = {
  kind: "ok";
  /** The versioned model id that actually answered, never the requested alias. */
  model: string;
  answers: Record<string, TypeSafeAnswer>;
  usage?: TypeSafeUsage;
  latency_ms: number;
};

export type SystemOneResult = SystemOneOk | SystemOneDisabled | SystemOneUnavailable | SystemOneMalformed;

/** One criterion with the evidence state the caller supplies for it. */
export type SystemOneCriterion = {
  id: string;
  description?: string;
  severity?: string;
  /** Set when the harness already established the result deterministically. */
  status?: string;
  check_command?: string;
  exit_code?: number;
};

export type SystemOneState = {
  contract: unknown;
  diff?: string;
  outputs?: unknown;
  /** Criteria with their evidence states; deterministic results are never sent to the provider. */
  criteria?: readonly SystemOneCriterion[];
  /** Deterministic tamper evidence owned by Tool Guard, protected paths and the captured diff. */
  tamper?: boolean;
};

export type EvaluateSystemOneOptions = {
  state: unknown;
  questions: Record<string, Question>;
  model?: string;
  apiKey?: string;
  timeoutMs?: number;
  /** Injectable transport; defaults to the ambient fetch. */
  fetch?: typeof globalThis.fetch;
  /** Injectable sleep; defaults to a timer. */
  delay?: (ms: number) => Promise<void>;
};

const EnvelopeSchema = z.object({
  model: z.string().min(1),
  answers: z.record(z.string(), z.unknown()),
  usage: z.unknown().optional(),
});

const isUnitInterval = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;

function validateAnswer(question: Question, answer: unknown): TypeSafeAnswer | undefined {
  if (typeof answer !== "object" || answer === null || Array.isArray(answer)) return undefined;
  const record = answer as Record<string, unknown>;
  switch (question.type) {
    case "noul": {
      return isUnitInterval(record.noul) ? { noul: record.noul } : undefined;
    }
    case "choice": {
      const options = Object.keys(question.criteria ?? {});
      if (options.length === 0) return undefined;
      const choice = record.choice;
      if (typeof choice !== "string" || !options.includes(choice)) return undefined;
      const probabilities = record.probabilities;
      if (typeof probabilities !== "object" || probabilities === null) return undefined;
      const entries = probabilities as Record<string, unknown>;
      const keys = Object.keys(entries);
      if (keys.length !== options.length || keys.some((key) => !options.includes(key))) return undefined;
      if (keys.some((key) => !isUnitInterval(entries[key]))) return undefined;
      return {
        choice,
        probabilities: Object.fromEntries(keys.map((key) => [key, entries[key] as number])),
      };
    }
    case "score": {
      const levels = question.criteria;
      const score = record.score;
      if (!Array.isArray(levels) || levels.length === 0) return undefined;
      if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > levels.length - 1) return undefined;
      return { score };
    }
  }
}

/** Every asked question must carry a valid typed answer; anything else is an invalid envelope. */
function validateAnswers(
  questions: Record<string, Question>,
  answers: Record<string, unknown>,
): Record<string, TypeSafeAnswer> | undefined {
  const validated: Record<string, TypeSafeAnswer> = {};
  for (const [name, question] of Object.entries(questions)) {
    if (!(name in answers)) return undefined;
    const answer = validateAnswer(question, answers[name]);
    if (!answer) return undefined;
    validated[name] = answer;
  }
  return validated;
}

function parseUsage(value: unknown): TypeSafeUsage | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const { input_tokens: input, output_tokens: output } = value as Record<string, unknown>;
  const isCount = (count: unknown): count is number => typeof count === "number" && Number.isFinite(count) && count >= 0;
  return isCount(input) && isCount(output) ? { input_tokens: input, output_tokens: output } : undefined;
}

function resolveApiKey(apiKey?: string): string | undefined {
  const resolved = apiKey ?? process.env.TYPESAFE_API_KEY;
  const trimmed = resolved?.trim();
  return trimmed || undefined;
}

export function resolveTypeSafeModel(model?: string): string {
  return model?.trim() || process.env.UH_TYPESAFE_MODEL?.trim() || DEFAULT_TYPESAFE_MODEL;
}

function normalizeTimeoutMs(timeoutMs: number | undefined): number {
  if (timeoutMs === undefined) return DEFAULT_TYPESAFE_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`timeoutMs must be a positive number of milliseconds, got ${timeoutMs}`);
  }
  return timeoutMs;
}

const sleep = (ms: number): Promise<void> => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

function raceAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return Promise.race([
    operation,
    new Promise<never>((_resolve, reject) => {
      if (signal.aborted) {
        reject(signal.reason);
        return;
      }
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }),
  ]);
}

function retryDelayMs(response: Response, attempt: number): number {
  const header = response.headers.get("retry-after")?.trim();
  const seconds = header ? Number(header) : Number.NaN;
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds, TYPESAFE_RETRY_AFTER_CAP_SECONDS) * 1000;
  return TYPESAFE_RETRY_DELAYS_MS[attempt - 1] ?? TYPESAFE_RETRY_DELAYS_MS[TYPESAFE_RETRY_DELAYS_MS.length - 1];
}

/**
 * One bounded provider call. Provider conditions never throw: they are returned
 * as discriminated results so callers can record why no judgment was applied.
 */
export async function evaluateSystemOne(options: EvaluateSystemOneOptions): Promise<SystemOneResult> {
  const apiKey = resolveApiKey(options.apiKey);
  if (!apiKey) return { kind: "disabled" };

  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  const request = options.fetch ?? globalThis.fetch;
  const delay = options.delay ?? sleep;
  const body = JSON.stringify({
    state: options.state,
    questions: options.questions,
    model: resolveTypeSafeModel(options.model),
  });
  const startedAt = Date.now();
  let lastStatus: number | undefined;

  for (let attempt = 1; attempt <= TYPESAFE_MAX_ATTEMPTS; attempt += 1) {
    const signal = AbortSignal.timeout(timeoutMs);
    let response: Response;
    try {
      response = await raceAbort(request(TYPESAFE_SYSTEM_ONE_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body,
        signal,
      }), signal);
    } catch {
      return signal.aborted ? { kind: "unavailable", reason: "timeout" } : { kind: "unavailable", reason: "transport" };
    }

    if (response.ok) {
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        return signal.aborted ? { kind: "unavailable", reason: "timeout" } : { kind: "malformed", reason: "invalid_json" };
      }
      const envelope = EnvelopeSchema.safeParse(payload);
      if (!envelope.success) return { kind: "malformed", reason: "invalid_envelope" };
      const answers = validateAnswers(options.questions, envelope.data.answers);
      if (!answers) return { kind: "malformed", reason: "invalid_envelope" };
      const usage = parseUsage(envelope.data.usage);
      return {
        kind: "ok",
        model: envelope.data.model,
        answers,
        ...(usage ? { usage } : {}),
        latency_ms: Date.now() - startedAt,
      };
    }

    lastStatus = response.status;
    if (!RETRYABLE_STATUSES.includes(response.status) || attempt === TYPESAFE_MAX_ATTEMPTS) break;
    await delay(retryDelayMs(response, attempt));
  }

  return { kind: "unavailable", reason: "http", status: lastStatus };
}

export type ThreeVerdict = "pass" | "needs-attention" | "needs-remediation";

export type ThreeVerdictResult = {
  kind: "ok";
  verdict: ThreeVerdict;
  confidence: number;
  tamper: boolean;
  /** The versioned model id that answered; thresholds are only valid for that version. */
  model: string;
  latency_ms: number;
  usage?: TypeSafeUsage;
  raw: unknown;
};

export type ThreeVerdictOutcome = ThreeVerdictResult | SystemOneDisabled | SystemOneUnavailable | SystemOneMalformed;

export type EvaluateThreeVerdictOptions = {
  model?: string;
  apiKey?: string;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
  delay?: (ms: number) => Promise<void>;
};

function hasDeterministicResult(criterion: SystemOneCriterion): boolean {
  return criterion.status === "passed" || criterion.status === "failed";
}

function hasDeterministicFailure(criterion: SystemOneCriterion): boolean {
  return criterion.status === "failed" || (typeof criterion.exit_code === "number" && criterion.exit_code !== 0);
}

function withPrompt(instructions: string, prompt?: string): string {
  const trimmed = prompt?.trim();
  return trimmed ? `${instructions} ${trimmed}` : instructions;
}

function criterionQuestion(index: number, criterion: SystemOneCriterion, prompt?: string): NoulQuestion {
  const path = `criteria[${index}]`;
  const label = criterion.description?.trim() || criterion.id;
  return {
    type: "noul",
    instructions: withPrompt(
      `Judge only whether the supplied evidence state at \`${path}\` satisfies this single criterion: "${label}". Use only \`${path}\` and do not infer unrecorded evidence.`,
      prompt,
    ),
    criteria: {
      true: `\`${path}\` satisfies the criterion "${label}".`,
      false: `\`${path}\` does not satisfy the criterion "${label}", or records it as failed, blocked, or unverified.`,
    },
  };
}

function reportQuestion(instruction: string, satisfied: string, unsatisfied: string, prompt?: string): NoulQuestion {
  return {
    type: "noul",
    instructions: withPrompt(instruction, prompt),
    criteria: { true: satisfied, false: unsatisfied },
  };
}

export function composeThreeVerdict(input: {
  deterministicFailure: boolean;
  criterionNouls: readonly number[];
  reportNouls: readonly number[];
}): ThreeVerdict {
  if (input.deterministicFailure || input.criterionNouls.some((noul) => noul < REMEDIATION_THRESHOLD)) {
    return "needs-remediation";
  }
  if (input.reportNouls.some((noul) => noul >= REPORT_FLAG_THRESHOLD)) return "needs-attention";
  return input.criterionNouls.every((noul) => noul >= PASS_THRESHOLD) ? "pass" : "needs-attention";
}

/**
 * Atomic three-verdict evaluation. Deterministic facts (a check that passed or
 * failed, tamper) are never asked of the model; the model answers one Noul per
 * remaining criterion plus the fixed report battery, and the verdict is
 * composed in code from those answers and the deterministic state.
 */
export async function evaluateThreeVerdict(
  state: SystemOneState,
  prompt?: string,
  options: EvaluateThreeVerdictOptions = {},
): Promise<ThreeVerdictOutcome> {
  const criteria = state.criteria ?? [];
  const asked = criteria
    .map((criterion, index) => ({ criterion, index, path: `criteria[${index}]` }))
    .filter(({ criterion }) => !hasDeterministicResult(criterion));

  const questions: Record<string, Question> = {};
  for (const { criterion, index } of asked) {
    questions[`criteria[${index}]`] = criterionQuestion(index, criterion, prompt);
  }
  questions[REPORT_QUESTIONS.work_incomplete] = reportQuestion(
    "Judge only whether the supplied report states that its work is incomplete.",
    "The report states the work is incomplete.", "The report does not state that the work is incomplete.", prompt,
  );
  questions[REPORT_QUESTIONS.names_blocker] = reportQuestion(
    "Judge only whether the supplied report names a blocker.",
    "The report names a specific blocker.", "The report names no blocker.", prompt,
  );
  questions[REPORT_QUESTIONS.claims_failed_check_passed] = reportQuestion(
    "Judge only from the supplied state: does the report claim a check passed that the state records as failed?",
    "The report claims a check passed that the state records as failed.", "The report makes no such claim.", prompt,
  );

  const response = await evaluateSystemOne({
    state,
    questions,
    model: options.model,
    apiKey: options.apiKey,
    timeoutMs: options.timeoutMs,
    fetch: options.fetch,
    delay: options.delay,
  });
  if (response.kind !== "ok") return response;

  // The envelope guarantees an answer for every asked question; an abstention
  // default keeps an unexpected gap from reading as a positive signal.
  const noulOf = (name: string): number => response.answers[name]?.noul ?? 0.5;
  const criterionNouls = asked.map(({ path }) => noulOf(path));
  const reportNouls = REPORT_QUESTION_NAMES.map((name) => noulOf(name));
  const askedNouls = [...criterionNouls, ...reportNouls];

  return {
    kind: "ok",
    verdict: composeThreeVerdict({
      deterministicFailure: criteria.some(hasDeterministicFailure),
      criterionNouls,
      reportNouls,
    }),
    confidence: askedNouls.length === 0 ? 0 : Math.min(...askedNouls.map((noul) => Math.abs(noul - 0.5))) * 2,
    tamper: state.tamper === true,
    model: response.model,
    latency_ms: response.latency_ms,
    ...(response.usage ? { usage: response.usage } : {}),
    raw: {
      model: response.model,
      answers: response.answers,
      ...(response.usage ? { usage: response.usage } : {}),
    },
  };
}
