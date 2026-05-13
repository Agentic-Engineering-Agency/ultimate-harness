# Ultimate Harness

Ultimate Harness is an early-stage project to build a **runtime-agnostic software-development harness** for agentic engineering work.

It sits above coding agents and agent runtimes. Instead of becoming “one more coding agent,” it standardizes the durable artifacts and lifecycle around agentic work:

```text
request / issue / spec
  -> workflow profile
  -> mission packet
  -> runtime adapter
  -> sandboxed execution
  -> verification result
  -> human review
  -> promotion into canonical project state
```

The goal is to combine proven patterns from specification-driven development, agent workflow systems, skill libraries, and sandboxing tools into a practical harness for planning, specifying, executing, verifying, and safely iterating on software work.

## Documentation-first status

This repository is intentionally documentation-first right now. Implementation should wait until the core product semantics are clear enough that a future coding agent does not have to invent them.

Start with the documentation spine:

- [Documentation home](./docs/README.md)
- [Glossary](./docs/glossary.md)
- [Product requirements](./docs/product/prd.md)
- [MVP scope](./docs/product/mvp-scope.md)
- [Architecture overview](./docs/architecture/overview.md)
- [Runtime adapter contract](./docs/architecture/runtime-adapter-contract.md)
- [Mission packet schema](./docs/architecture/mission-packet-schema.md)
- [Verification and promotion lifecycle](./docs/architecture/verification-and-promotion.md)
- [BMAD-style agent map](./docs/workflows/bmad-agent-map.md)

## Inspiration

Ultimate Harness studies and selectively integrates ideas from:

- [Specsafe](https://github.com/Agentic-Engineering-Agency/specsafe/issues) — specification safety and issue-driven development practices.
- [BMAD Method](https://github.com/bmad-code-org/BMAD-METHOD) — structured agent roles, planning, and delivery workflows.
- [superpowers](https://github.com/obra/superpowers) — composable agent capabilities and disciplined software-development skills.
- [GSD](https://github.com/gsd-build/get-shit-done) — context engineering, fresh-context execution, and durable project context.
- [matt-pocock/skills](https://github.com/mattpocock/skills) — focused reusable engineering skills.
- [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) — open multi-agent harness patterns.
- [OpenSpec](https://github.com/Fission-AI/OpenSpec) — artifact-guided specification workflows.
- [Pi](https://pi.dev/) and [oh-my-pi](https://github.com/can1357/oh-my-pi) — customizable terminal agent harnesses and possible runtime targets.
- [AgentFS](https://github.com/tursodatabase/agentfs/blob/main/MANUAL.md) — copy-on-write agent filesystem and sandboxing patterns.

See the [comparison matrix](./docs/research/comparison-matrix.md) and [adopt/reject/defer log](./docs/research/adopt-reject-defer.md) for the current design position.

## Core runtime direction

Ultimate Harness remains runtime-agnostic. Pi/oh-my-pi may become an important runtime or engine candidate, but the first design requirement is a portable adapter contract that can support Codex, Claude Code, Pi/oh-my-pi, Hermes, and future runtimes.

## Sandboxing focus

Safe execution is a core value proposition. Ultimate Harness models sandboxed work through backends such as git worktrees and AgentFS-style copy-on-write filesystems, then requires verification and promotion before generated work becomes canonical.

## Project vision

Ultimate Harness aims to provide:

- Specification-first planning and execution.
- Portable mission packets for bounded agentic work.
- Runtime adapters for multiple coding agents.
- Reusable skills and workflow profiles.
- Sandboxed environments for safer autonomous development.
- Structured verification and human approval gates.
- Clear audit trails for decisions, file changes, checks, and promotion.

This repository is currently a starting point for that exploration.
