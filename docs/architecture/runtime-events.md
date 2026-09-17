# Native runtime events

Ultimate Harness supervises native events emitted by each runtime. Lifecycle fields—not arbitrary model text or tool output—drive readiness, progress, policy stops and completion. The examples below are illustrative contract shapes; they are not transcripts or acceptance records.

## oh-my-pi

| Event or fact | Native shape | Supervision behavior |
|---|---|---|
| Tool start | `{"type":"tool_execution_start","toolCallId":"<call>","toolName":"bash","args":{"command":"<command>"}}` | Track the call as in flight, update readiness/progress, and evaluate protected paths. Arguments are in `args`; normalized `input` is also supported. |
| Tool end | `{"type":"tool_execution_end","toolCallId":"<call>","isError":true,"result":{"content":[{"text":"CONTRACT: <reason>"}]}}` | Clear the in-flight call. An error result prefixed with `CONTRACT:` represents a guard denial and counts toward `max_denials`. |
| Terminal | `{"type":"agent_end","messages":[]}` | Record native completion, inspect terminal failure facts and require a valid nonempty final-message sentinel. |
| Usage | Native assistant/message usage fields | Preserve measured input, output and cache counters. Missing or incomplete values remain unknown; repeated envelopes must not double-count a message. |

OMP tool-result messages are not interchangeable with assistant failure messages. Arbitrary response identifiers, quoted errors and reasoning payloads must not be treated as authentication failures.

## Command Code

| Event or fact | Native shape | Supervision behavior |
|---|---|---|
| Tool queued | `{"type":"event","event":{"type":"tool_queued","toolCallId":"<call>","toolName":"shell_command","input":{"command":"<command>"}}}` | Track the call and evaluate protected paths. Tool arguments are in `input`. |
| Pre-tool hook | `{"type":"event","event":{"type":"tool_hooks","toolCallId":"<call>","phase":"pre","outcome":{"kind":"block","text":"<reason>"}}}` | Distinguish an observed hook invocation from missing hook evidence. |
| Hook denial | `{"type":"event","event":{"type":"tool_hook_blocked","toolCallId":"<call>","hookOutput":"<reason>"}}` | Clear the call and count the denial once. |
| Route | `{"type":"event","event":{"type":"model_request_start","model":"<provider>/<model>"}}` | Compare observed and configured routes. Unattested or mismatched routes fail rather than silently fall back. |
| Usage | `{"type":"event","event":{"type":"turn_end","usage":{"inputTokens":11,"outputTokens":3,"cacheReadTokens":5,"cacheWriteTokens":1}}}` | Aggregate reported counters; absent/invalid values remain unknown. Cost requires its own provenance. |
| Terminal | `run_end` followed by `result` | Evaluate native failure fields and the final-message sentinel. |

Native permission refusal and a UH guard denial are distinct. Guarded print-mode execution requires the native permission mode selected by the adapter plus evidence that the hook actually ran. A runtime flag alone is not enforcement evidence.

## Claude Code

The adapter consumes stream-JSON envelopes and normalizes their nested events for supervision. It observes native model identity, tool activity and terminal results. Native `message_start`, `message_delta` and `message_stop` events provide fallback usage when execution ends without a terminal result. An unfinished message cannot establish complete output or total-token counters.

The optional live-usage callback publishes available counters in the canonical runtime-control receipt. Reporting usage does not enforce a token budget. Model alias compatibility, native-denial attribution, inherited coordinator context and truncated-stream accounting remain documented [runtime work](../ROADMAP.md#runtime-reliability-and-accounting).

## Shared supervision contract

`RuntimeSupervision.observe` normalizes native event objects and:

- treats `tool_queued`, `tool_execution_start`, and `tool_running` as tool-start events;
- reads arguments from `input` or `args`, with a flat `command` fallback;
- evaluates protected paths on the first tool event for a call identifier;
- treats `tool_execution_end` and `tool_completed` as tool-result events;
- recognizes native denial events and prefixed contract errors;
- recognizes `run_end`, `result`, and `agent_end` as native terminal events;
- excludes arbitrary text deltas from progress and nested tool-result messages from native terminal-failure classification.

A terminal event alone does not establish success. Completion also requires no native failure, supervision stop, cancellation, timeout, spawn failure or captured error, plus the adapter's final-message contract. An exit code is one fact: a nonzero launcher exit after otherwise valid native completion may be retained with an explicit ignored-exit reason; an exit before valid completion remains a failure.

## Reproducible checks

- `tests/oh-my-pi.test.ts`, `tests/command-code.test.ts`, and `tests/claude-code.test.ts` cover adapter interpretation.
- `tests/runtime-supervision.test.ts` covers shared lifecycle transitions and policy stops.
- `tests/runtime-process.test.ts` exercises owned child-process lifecycle and control-receipt persistence.
- [Supervisor-loop smoke](../runbooks/supervisor-loop-smoke.md) exercises the built CLI using deterministic runtime fixtures.
- [Tool-guard smoke](../runbooks/tool-guard-smoke.md) exercises the hook and extension interfaces.

Fixtures must emit the native shapes of the runtime being modeled. Synthetic events establish parser/supervisor behavior, not live provider compliance. Keep generated transcripts and local execution records outside the public source tree.
