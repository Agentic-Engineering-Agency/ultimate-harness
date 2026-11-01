# A2A, MCP and ACP: which boundary is which (read 2026-09-21)

| | MCP | ACP | A2A |
|---|---|---|---|
| Relationship | agent to tools/data | client (editor, orchestrator UI) to one coding agent | agent to opaque peer agent |
| Current | spec 2026-07-28 | v1 stable, v2 Draft 2026-07-20 | 1.0.0, Linux Foundation, proto is normative |
| Transport | stdio, Streamable HTTP | stdio (HTTP draft) | JSON-RPC over HTTP/SSE, gRPC, HTTP+JSON |
| Unit of work | tool call; long work via `io.modelcontextprotocol/tasks` extension (tasks/get polling, tasks/update) | session + prompt; v2 decouples prompt from turn | Task with states SUBMITTED, WORKING, INPUT_REQUIRED, AUTH_REQUIRED, COMPLETED, FAILED, CANCELED, REJECTED; Artifacts as outputs |
| Discovery | server/discover | ACP Registry | AgentCard at /.well-known/agent-card.json with skills and security schemes |
| State | stateless since 2026-07-28: no initialize handshake, no session id; server-minted handles passed as arguments | stateful sessions, resume, list, close | stateful tasks, contextId groups turns, push notifications |

MCP 2026-07-28 also: multi round-trip requests replace server-initiated requests (result carries `resultType: input_required`), OTel trace context keys in `_meta` (traceparent, tracestate, baggage), deterministic tools/list order "to improve LLM prompt cache hit rates", ttlMs/cacheScope on list results.

A2A's own statement: MCP is how an agent uses a capability; A2A is how agents "partner or delegate work" as peers without exposing internal state. A server agent fulfilling an A2A task may use MCP underneath.

## What this means for a UH team coordinator talking to foreign agents
- A UH mission already is an A2A Task in shape: id, status lifecycle, artifacts, input-required (blocked/awaiting-human), cancel. UH's `blocked` and `awaiting-human` map to INPUT_REQUIRED / AUTH_REQUIRED; `policy` and fleet refusals map to REJECTED.
- Inbound (foreign orchestrator delegates to UH): A2A server face is the right one when the caller is an autonomous agent over a network; ACP agent face when the caller is a local client driving a session over stdio; MCP tools + tasks extension when the caller is a model host that only speaks MCP (Claude Code, most IDE agents). All three can be thin projections of the same run directory. Build order should follow who actually calls UH: Orca, Claude Code, Hermes, Herdr. Verify each one's supported protocol before choosing.
- Outbound (UH worker is a foreign agent): a foreign A2A agent is opaque. UH cannot guard its tools, attest its model route, or account its cost beyond what it reports. Under the current invariants (zero uncontained escapes, fleet policy, deterministic evidence) a foreign A2A worker can only be admitted as an untrusted producer whose artifacts enter through the same output verification and review gates as any diff, never as a guarded worker.
- Trace context: MCP now standardizes traceparent in `_meta`. If UH emits OTel spans it should propagate the same keys so a host's trace and UH's trace join.
