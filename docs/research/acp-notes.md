# ACP notes (read 2026-09-21, agentclientprotocol.com docs bundle, 124 pages)

## State of the protocol
- v1 stable; JSON-RPC 2.0 over stdio, newline-delimited, agent is a subprocess of the client. Streamable HTTP/WebSocket transport is a draft RFD with a Transports Working Group. stdio is the only SHOULD.
- v2 published as Draft on 2026-07-20. Version negotiated at initialize; v1 and v2 can be served side by side.
- Stabilized in v1 since launch (via RFDs): session/list, session/resume, session/close, session/delete, logout, request cancellation, session usage (context size + cumulative cost), message IDs, tool-call names, elicitation, session config options (incl. model category), additional workspace roots, implementation info, ACP Registry. Rust and TypeScript SDKs are 1.0.
- Open RFDs relevant to UH: proxy chains (conductor + proxy/successor), MCP-over-ACP, end-turn token usage, session compaction, session fork, configurable LLM providers.

## Who speaks it
Agents: Codex CLI (agentclientprotocol/codex-acp), Claude Agent (zed-industries/claude-agent-acp), Hermes Agent, Pi (pi-acp), OpenCode, Gemini CLI, Qwen Code, Goose, Cursor, Copilot CLI, Kimi CLI, Kiro, OpenHands, Cline, Junie, Mistral Vibe, Docker cagent, Factory Droid, ~40 total. oh-my-pi ships `omp acp` (seen in `omp --help`; not in the ACP list).
Clients: Zed, JetBrains, VS Code extensions, neovim, Emacs, plus a class that matters to UH: orchestrators and gateways built on ACP (Jockey, Codeg, CompozyOS, Kronos scheduler, Remote Agent Server async Task API, AgentConnect, Kepler).

## v2 changes that matter
- Prompt response acknowledges insertion (returns messageId); session/update flows at any time; agent reports idle. Enables queueing, steering, background work, multiple observers. This is the mid-run steering channel the UH roadmap lacks.
- Tool calls, messages, terminal output are upserts patched by stable id; tool-call content streams.
- Diffs become structured file changes (add/delete/modify/move/copy/binary) with optional git_patch.
- session/load removed; session/resume does both. Session modes become config options.
- Client fs/* and terminal/* methods and capabilities are REMOVED: "has not been widely adopted... many Agents are moving toward their own sandboxing and execution configuration."

## Consequences for UH
1. UH as ACP client (one generic adapter): every supported runtime already has an ACP face. One adapter would replace per-runtime stdout parsers for events, tool calls, usage/cost, cancel, resume. Risk: adapters via third-party shims (codex-acp, claude-agent-acp, pi-acp) add a dependency and may lag native event detail (route attestation, native session ids). Needs a fidelity comparison against current native parsing before replacing anything.
2. UH as ACP agent (server): `uh acp` over stdio makes UH drivable by any ACP client/orchestrator. A mission run maps to a session; events.ndjson maps to session/update; runtime-control usage maps to session usage; cancel maps to session/cancel.
3. UH as conductor/proxy: the proxy-chain RFD describes UH's supervisory position exactly (sit between client and agent, intercept, inject, filter, create sub-sessions). It is an RFD with a Rust prototype, not stable. Do not build on it yet; track it.
4. The guard cannot move to ACP. Permission requests are agent-initiated and v2 drops client fs/terminal. Tool Guard hooks + sandbox stay the enforcement layer; ACP permission requests are at most an additional signal.
