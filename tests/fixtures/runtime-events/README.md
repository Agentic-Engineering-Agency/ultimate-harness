# Native runtime event fixtures

Excerpts of real native event streams, reduced to structure. Event order, event
types, tool names, call ids, error flags, usage counters and route fields are
kept. Text is replaced with `x`, commands keep only their executable name,
paths are relative to the worker root or `/outside/path`, ids are renumbered and
timestamps are rebased. Streaming delta events are dropped.

| File | Runtime | What it shows |
|---|---|---|
| `command-code-healthy.ndjson` | Command Code | A run that reads, edits, runs tests and finishes. Tool events are keyed by `toolCallId`; arguments are under `input` (`paths`, `file_path`, `pattern`, `command`). |
| `command-code-denied-retries.ndjson` | Command Code | A run whose writes are denied by the guard hook (`tool_hooks`, `tool_hook_blocked`) and retried by other routes. |
| `command-code-usage.ndjson` | Command Code | A run whose every model call reports usage on `model_request_end` and the same usage object again on its matching `turn_end` (sums must not double count). Three calls, one turn each; the final `result` event carries no price, so the run's cost is only knowable from an operator price table. |
| `oh-my-pi-healthy.ndjson` | oh-my-pi | A run using `tool_execution_start` / `tool_execution_end` with arguments under `args`. |

Use these instead of hand-written event shapes when testing anything that reads
native events.
