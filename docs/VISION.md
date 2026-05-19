# Vision

Ultimate Harness is a runtime-agnostic discipline layer for agentic software
development. It is not a coding agent. It is the scaffolding that keeps work
auditable, reproducible, and safe to promote into a real codebase regardless
of which coding agent did the work.

The goal is **portable discipline**. A project that adopts UH should be able
to switch coding agents — Hermes today, Codex tomorrow, oh-my-pi the day
after — without losing its specifications, its skills, its workflow state,
its sandbox boundaries, its audit trail, or its human approval gates. The
agent is fungible. The discipline is not.

## Who this is for

UH is built for engineers who are responsible for shipping software produced
with help from agents and who must be able to defend that software to a
reviewer, an auditor, or a future maintainer. If you can answer "which
prompt, which model, which sandbox, which diff, which verification, which
human approved it" for every change, you are the audience. If your concern
is "how do I write a prompt", you want a different tool.

UH is also for teams that want to compare runtimes empirically rather than
on vibes: same mission, same workflow, three adapters, side-by-side
artifacts. UH treats the runtime as a swappable dependency.

## Principles

1. **Discipline over agents.** The agent runtime is a backend. The harness
   owns the lifecycle: spec, mission, sandbox, verify, promote. Adding a new
   adapter is one file; changing the discipline is a deliberate schema bump.

2. **Schemas, not conventions.** Every persisted artifact is validated
   against a versioned Zod schema. `uh.mission.v0`, `uh.runtime-result.v0`,
   `uh.workflow.v0`, and friends are contracts. Typos at adapter-load or
   mission-override time fail fast.

3. **Explicit human gates.** Sandbox work does not become canonical work
   without an explicit, recorded promotion decision. Verification can run
   automatically; promotion never does. The audit log is the source of
   truth for "who said yes".

4. **Filesystem first, daemon never.** `.harness/` is plain YAML and
   NDJSON on disk. Anything that reads or mutates state is a short CLI
   invocation. No long-lived server, no shared mutable in-process state
   across runs.

5. **Same prompt, every adapter.** A mission renders the same logical
   prompt regardless of which adapter dispatches it. Adapter-specific
   preludes are additive. Cross-runtime parity is a feature, not a goal.

6. **Drift is a first-class concept.** Stale worker locks, orphaned
   worktrees, truncated event logs, and roadmap/Linear divergence are
   detectable problems with idempotent repairs. The discipline layer
   notices when reality has drifted from what the artifacts claim and
   either repairs it or asks for help.

7. **Three-verdict reviews.** Pass / needs-attention / needs-remediation —
   not a binary green/red light. Real reviewers find subtle things that
   should be paper-trailed without blocking a promotion.

## What we won't accept

These are not stylistic preferences; they are non-negotiable design
positions. PRs that violate them will be rejected on principle.

- **No silent fallbacks.** When a runtime is missing, a manifest is
  malformed, or a configuration is wrong, UH MUST fail loudly with the
  specific path / id / field at fault. Substituting defaults to "keep
  going" hides bugs that surface later as incidents.

- **No hidden state.** Anything that affects a decision MUST be on disk,
  in a versioned artifact, with a schema. No "the harness remembers" in
  process memory across runs. If `uh status` does not see it, it does not
  exist.

- **No special-case for the agent that wrote it.** The discipline applies
  identically to human commits, Hermes commits, Codex commits, oh-my-pi
  commits. Adapters do not get to bypass schemas or gates because they
  are "trusted".

- **No PR-time linting in place of design.** The discipline lives in the
  schemas, the workflow profiles, and the artifact lifecycle — not in
  scripts that run last and rewrite the diff. If a constraint matters,
  encode it in the type system or the schema, not in a CI hook.

- **No prompt-string libraries dressed as architecture.** The harness
  composes prompts from explicit fields (mission, workflow, issues, read
  first, expected artifacts, verification checks). It does not curate a
  collection of "magic prompts". Prompts are derived from the mission;
  the mission is the source of truth.

- **No agent stack-traces in the user-facing path.** Adapter failures
  must classify into the four runtime-result statuses (`passed`, `failed`,
  `blocked`, `cancelled`) with a structured error list. "It crashed" is
  not a status.

## Relationship to other inspirations

UH studies and selectively adopts ideas from the systems documented in
`docs/research/`. The shortlist that materially shaped the current design:

- **GSD / GSD-2 (`gsd-pi`)** — discipline-layer mindset, three-verdict
  reviews (UH-76), drift detection (UH-77), LLM-less query mode (UH-78),
  and the "VISION.md as a load-bearing artifact" pattern this file
  inherits. UH is closer in spirit to GSD than to any of the coding
  agents it wraps.
- **BMAD-METHOD** — workflow phase / agent-role decomposition. UH treats
  BMAD as inspiration, never as a dependency.
- **specsafe, OpenSpec** — schema-backed mission packets and
  acceptance criteria as a first-class field rather than freeform text.
- **oh-my-claudecode / oh-my-codex** — team mission shape (UH-71),
  companion `design.md` (UH-75), adversarial QA workflow (UH-74).
- **superpowers, matt-pocock/skills** — skills as durable reusable
  capabilities with versioned metadata.
- **AgentFS** — future-pointing copy-on-write sandbox backend (designed,
  not yet implemented).

We do not adopt anything that conflicts with the principles above. Divergences are documented in `docs/research/adopt-reject-defer.md`.
