# Ultimate Harness — Road to v1.0 — Product Requirements Document (PRD)

## Requirements Description

### Background
- **Business Problem**: UH is at **v0.7.0** (on npm, with a Hermes plugin + docs site). Pre-1.0 SemVer signals "expect breaking changes." The team needs a defined, credible path to a **v1.0** an external user can adopt with a stability guarantee.
- **Target Users**: agent-driven engineering teams running missions across multiple runtimes; the founding team dogfooding; the first external adopter at 1.0 (a friend of the lead will test 1.0 against one of their own repos).
- **Value Proposition**: a 1.0 that means *complete enough + stable enough + adoptable* — not just a version number.

### What "v1.0" means (locked)
All four pillars: **(1) Stability promise** — freeze + version the public surfaces; **(2) Feature-complete core** — adapters, sandbox backends, verify/promote, memory all *done* (no stubs/experimental); **(3) Production-ready plugin + DX**; **(4) Adoption-ready** — an outsider runs UH end-to-end from docs.

- **Stability surfaces frozen at 1.0** (all four): on-disk artifact schemas (mission/adapter/workflow/runs/verification/promotion) + documented `schema_version` bump policy; the `uh` CLI command/flag surface; the Hermes plugin `/api/uh/*` + manifest contract; the AdapterCapabilities + per-adapter `runtime_config` contract.
- **Adoption proof at 1.0** (all four): quickstart (`uh init`→first mission, <10 min) + runnable example-mission repo/dir; **a friend completes a mission unaided against their own repo** (the real bar); docs completeness (setup runbook per adapter, concepts/architecture coverage, no dead links); a short screencast (install→mission→verify→promote).

### Feature Boundaries
- **In scope (road to 1.0):** multi-runtime container sandbox backend (+ optional AgentFS), Honcho MCP tools + opt-out, native Anthropic adapter, oh-my-pi→active, capability-*declaration* enforcement (**warn + `--strict`**), the stability freeze, and the adoption package. (Cross-runtime QA `run-all --runtimes` and TUI polish UH-48..53 are **already shipped** — not in scope.)
- **Out of scope (post-1.0):** **Muta integration** — confirmed deferred entirely to the 1.x line (not a 1.0 blocker; needs a co-founder conversation first).

### Starting point (v0.7.0 — done)
**6 wired adapters**: `hermes`, `codex`, `hermes-proxy`, `openrouter`, **`pi`** active; `oh-my-pi` experimental. Sandbox: `git-worktree` + `directory` backends (`container` = fail-fast stub, #137).

**Already shipped — explicitly NOT future scope** (the review caught these inflated in the first draft):
- verify-then-promote; **capability-match enforcement on `runtime_requirements`** (`enforceRuntimePreflight`/`assertRuntimeRequirements`, with `--force` bypass);
- **cross-runtime QA: `uh mission run-all --runtimes …`** with side-by-side diff/sentinel comparison (`persistRuntimeComparison`, agreement/divergent runtimes);
- **TUI/plugin polish UH-48..53** (UH_TUI_THEME, `$EDITOR`, Ctrl+Z suspend, `tui screenshot`, footer adapter-check age, `runtime.cancelled` on SIGTERM);
- Honcho memory (codex/hermes), SDD/TDD, cost routing, Hermes plugin, docs site.

The genuinely-remaining work to 1.0 is therefore narrower than a naive backlog read suggests.

## Design Decisions

### Cadence
**Scope-driven** (no fixed dates). The expanded container scope (below) makes it a milestone of its own, giving a proposed four-release line: 0.8.0 → 0.9.0 → 0.10.0 → 1.0.0. 1.0 ships when its exit checklist is green.

### Sandbox isolation research (informs 0.8.0)
Stakeholder asked for Docker + Podman parity (plus OrbStack/containerd/Colima/nerdctl) and then nominated four specific projects to **replace** the generic candidate set: `alibaba/OpenSandbox`, `agent-sandbox/agent-sandbox`, `kubernetes-sigs/agent-sandbox`, and **Turso AgentFS**. Evaluation:

**Two orthogonal isolation tiers** (the key reframing):
- **Filesystem isolation** — *what the agent can change*. Today: `git-worktree` + `directory`-clone backends.
- **Execution isolation** — *process / network / kernel boundary for untrusted code*. Today: none (container = stub).

| Project | Tier | Local-first fit (UH, macOS/Apple-Silicon) | License / maturity |
|---|---|---|---|
| **Turso AgentFS** | Filesystem (COW on a single SQLite file; `agentfs run bash`) | ✅ strong — local CLI + Turso-stack-aligned; snapshots/branches; **isolates files, NOT execution** | BETA |
| **alibaba/OpenSandbox** | Execution (Docker + gVisor/Kata/Firecracker; `osb` CLI, TS SDK, MCP) | ✅ good — local Docker mode covers the whole runtime+microVM matrix in one project; heavier dep (Python/Go backend) | Apache-2.0 |
| **agent-sandbox/agent-sandbox** | Execution (E2B-compatible, k8s) | ❌ needs k8s 1.26+ server; REST/MCP to a remote — cloud path only | Apache-2.0, early |
| **kubernetes-sigs/agent-sandbox** | Execution (`Sandbox` CRD, gVisor/Kata) | ❌ needs a k8s cluster — cloud path only | Apache-2.0, v0.4.x |

- **One CLI surface for the raw fallback.** Docker/Podman/nerdctl share the `docker`-style surface; OrbStack/Colima expose a docker socket; containerd via nerdctl → one OCI/docker-CLI auto-detect path if we don't adopt OpenSandbox.
- **macOS reality**: Firecracker/KVM is Linux-only; on macOS, Docker/OrbStack/Colima already run a Linux VM (VM boundary by default); AgentFS/libkrun use the file/Virtualization layers. Document the actual isolation per path/OS.

**Design implication (spike decides):**
- **Filesystem tier** — evaluate **AgentFS** as a new `agentfs` sandbox backend (COW branches; Turso-aligned; lean) alongside git-worktree/directory. Caveat: BETA + FS-only, so it complements but can't be the *only* isolation for untrusted code.
- **Execution tier** — choose between **(a) adopt OpenSandbox** (batteries-included local Docker + microVM, TS SDK/MCP — fastest path to the full matrix, heavier dependency) vs **(b) a lean in-house OCI/docker-CLI `ContainerBackend`** (auto-detect docker/podman/nerdctl + `runtime_config.container` with `oci_runtime` passthrough for kata/runsc — minimal deps, more glue). Weigh against the stack-minimalist preference.
- **Cloud tier (post-1.0)** — the two k8s projects (`kubernetes-sigs/agent-sandbox`, `agent-sandbox`) are the future cloud/cluster execution backend, not the local 1.0 default; note for the 1.x line (and as a potential **Muta** integration point).

Reuse the bind-mount/clone approach so dirty/promotion plumbing is unchanged regardless of tier; record the decision in `docs/architecture/sandbox-backends.md`.

### Proposed milestone partition (dependency- + value-ordered)

| Milestone | Theme | Scope | Pillar |
|---|---|---|---|
| **v0.8.0** | **Sandbox isolation** | (1) isolation spike → ADR across two tiers (filesystem: AgentFS vs git-worktree/directory; execution: adopt OpenSandbox vs lean OCI/docker-CLI `ContainerBackend`); (2) implement the chosen execution backend — **if the lean OCI path wins**: auto-detect docker/podman/nerdctl + orbstack/colima socket with `runtime_config.container` (`oci_runtime` passthrough for gVisor/Kata); **if OpenSandbox wins**: integrate its local mode (its secure runtime is configured per OpenSandbox, not per-mission `runtime_config`); plus, if green-lit, an `agentfs` COW filesystem backend; (3) **oh-my-pi → active** | Feature-complete |
| **v0.9.0** | **Memory & adapter matrix** | (1) Honcho `honcho_search`/`honcho_remember` as mission MCP tools + per-mission `runtime_config.honcho_memory` opt-out; (2) native Anthropic adapter (pay-per-token; ToS posture documented) | Feature-complete |
| **v0.10.0** | **Capability enforcement & adoption** | (1) **capability-*declaration* enforcement** — make the manifest/mission `capabilities:` list binding (validated against the adapter's declared capabilities) with **warn by default + `--strict` errors** (mirroring `--strict-spec`). NEW vs the already-shipped `runtime_requirements` preflight; (2) adoption package — quickstart + example-mission repo/dir + docs-completeness pass + screencast; recruit + schedule the friend's dry-run | Adoption (build) |
| **v1.0.0** | **Stability** | (1) freeze + version + document all four public surfaces + deprecation policy + SemVer commitment (`docs/STABILITY.md` + CHANGELOG `[1.0.0]`); (2) **run the friend's external dry-run** against their repo on the now-frozen surface — triage friction as blockers; (3) 1.0 release notes | Stability + Adoption (prove) |

**Why this order:** feature work that can still change schemas/CLI lands first (0.8–0.10) so the 1.0 freeze locks a settled surface; the external dry-run runs last against the frozen surface.

### Constraints
- **Container in CI**: Depot runners have no nested container/VM runtime → the container backend is verified via a documented **local** smoke (mirror the OpenRouter/pi "human runs the live smoke" pattern), not a blocking CI job. A CI job can run only if a runtime is available.
- **macOS vs Linux isolation** differs (above) — document per-path, don't over-promise microVM isolation where only a shared Linux VM exists.
- **Native Anthropic ToS**: official pay-per-token API key, documented posture (as with anthropic-via-omp).
- **Schema freeze is one-way**: get the surfaces right in 0.8–0.10; breaking a frozen surface after 1.0 costs a 2.0.

### Risk Assessment
- **Container backend is the heaviest, least-CI-verifiable item + now carries a research spike.** *Mitigation*: timebox the spike; ship behind the existing `SandboxBackend` iface with the stub as fallback; gate on a documented local smoke per engine.
- **Runtime matrix sprawl** (6 named tools). *Mitigation*: collapse to one docker-compatible CLI path + auto-detect; treat orbstack/colima/containerd as "detected, not bespoke."
- **Adoption bar depends on the friend's availability.** *Mitigation*: **recruit + schedule** the friend during 0.10.0, but **run** the dry-run in 1.0.0 against the frozen surface (don't test before the stability surface is final); their friction log = 1.0 blockers.
- **Scope drift** (all four pillars + expanded container). *Mitigation*: the exit checklist below is the contract; off-list = post-1.0.

## Acceptance Criteria (v1.0 exit checklist)

### Pillar 1 — Stability
- [ ] All four surfaces documented as stable + versioned (artifact schemas, CLI, plugin API, capability contract); `docs/STABILITY.md` with `schema_version` bump + deprecation policy.
- [ ] CHANGELOG `[1.0.0]` states the SemVer stability commitment.

### Pillar 2 — Feature-complete core
- [ ] Execution-isolation backend works end-to-end via documented local smoke (OpenSandbox local mode, or in-house auto-detect docker/podman/nerdctl + orbstack/colima socket); microVM/`oci_runtime` path verified on ≥1 runtime (gVisor/Kata).
- [ ] If adopted: `agentfs` (Turso AgentFS) COW filesystem backend round-trips create/dirty/discard; documented as FS-isolation (pairs with execution isolation for untrusted code).
- [ ] All shipped adapters `active` (no `experimental`); oh-my-pi graduated; native Anthropic present.
- [x] Cross-runtime QA harness (`run-all --runtimes`) with side-by-side comparison — **already shipped (v0.7.x)**.
- [ ] Honcho MCP tools (`honcho_search`/`remember`) + per-mission opt-out.
- [ ] Manifest `capabilities:` *declarations* enforced (warn default, `--strict` errors) — distinct from the already-shipped `runtime_requirements` preflight.

### Pillar 3 — Production plugin + DX
- [x] TUI polish UH-48..53 — **already shipped** (UH-48/49/50/51 in v0.4.0; footer age UH-52; `runtime.cancelled` UH-53).
- [ ] Plugin `/api/uh/*` endpoints + manifest contract reviewed + frozen (1.0 stability gate).

### Pillar 4 — Adoption-ready
- [ ] Quickstart `uh init`→first verified mission <10 min, documented.
- [ ] Runnable example-mission repo/dir.
- [ ] Friend completes a mission unaided against their own repo; friction log triaged to zero blockers.
- [ ] Docs completeness: setup runbook per adapter, concepts/architecture coverage, zero dead links.
- [ ] Screencast (install→mission→verify→promote).

### Quality gates (every milestone)
- [ ] Full suite green on CI (Depot); typecheck + build clean; dev-first PRs + green CI before merge; dev→main release PR; CHANGELOG/ROADMAP truth-up; milestone closed.

## Execution Phases (= the milestones)

### Phase 1 — v0.8.0 "Sandbox isolation"
- [ ] Isolation spike → ADR: filesystem tier (AgentFS vs git-worktree/directory) + execution tier (OpenSandbox vs lean OCI/docker-CLI across docker/podman/nerdctl/orbstack/colima/containerd, gVisor/Kata passthrough); k8s options (kubernetes-sigs/agent-sandbox, agent-sandbox) recorded as the post-1.0 cloud path.
- [ ] Implement the ADR-chosen execution backend: **lean OCI path** → multi-runtime `ContainerBackend` (auto-detect + `runtime_config.container`); **OpenSandbox path** → integrate its local mode (runtime configured in OpenSandbox, not per-mission). Local smoke per available engine.
- [ ] oh-my-pi → `active`.
- **Deliverables**: real container backend + the active-adapter matrix. **Est.**: 1 milestone (spike-gated).

### Phase 2 — v0.9.0 "Memory & adapter matrix"
- [ ] Honcho MCP tools (`honcho_search`/`remember`) + per-mission opt-out.
- [ ] Native Anthropic adapter (+ runbook).
- **Deliverables**: complete memory story + adapter matrix. **Est.**: 1 milestone.

### Phase 3 — v0.10.0 "Capability enforcement & adoption"
- [ ] Capability-*declaration* enforcement: manifest/mission `capabilities:` binding (warn + `--strict`), distinct from the shipped `runtime_requirements` preflight.
- [ ] Adoption package: quickstart + example repo + docs-completeness pass + screencast.
- [ ] Recruit + schedule the friend's dry-run (runs in 1.0.0).
- **Deliverables**: binding capability declarations + built adoption package. **Est.**: 1 milestone.

### Phase 4 — v1.0.0 "Stability"
- [ ] Freeze + document all four surfaces + deprecation policy + SemVer commitment.
- [ ] Friend's external dry-run; triage friction.
- [ ] Cut v1.0.0 + plugin-v1.0.0.
- **Deliverables**: stable, adoptable v1.0.0 on npm. **Est.**: 1 stabilization milestone.

## Resolved clarifications (round 3)
1. **Container runtimes** → Docker + Podman parity + OrbStack/containerd/Colima/nerdctl via one OCI/docker-CLI auto-detect path. Candidate set replaced (round 4) with stakeholder-nominated projects: **Turso AgentFS** (filesystem-COW tier), **alibaba/OpenSandbox** (local execution tier, batteries-included), and **kubernetes-sigs/agent-sandbox** + **agent-sandbox/agent-sandbox** (k8s = post-1.0 cloud tier). Two-tier framing (filesystem vs execution) decided in the 0.8.0 spike.
2. **External adopter** → the lead's friend tests 1.0 against one of their own repos (Phase 4 bar).
3. **Muta** → entirely post-1.0.
4. **Capability enforcement** → warn by default + `--strict` (mirrors `--strict-spec`).

### Remaining sub-questions (resolve at phase start)
- 0.8.0: default isolation strategy + which microVM runtime is first-class (spike output).
- 0.10.0: is 0.10.0 one milestone or split (adapter+enforcement vs DX+adoption)?

## Research sources
Stakeholder-nominated (round 4 — the primary candidate set):
- Turso AgentFS (filesystem COW) — https://docs.turso.tech/agentfs/introduction
- alibaba/OpenSandbox (local execution + microVM) — https://github.com/alibaba/OpenSandbox
- kubernetes-sigs/agent-sandbox (k8s, cloud tier) — https://github.com/kubernetes-sigs/agent-sandbox
- agent-sandbox/agent-sandbox (E2B-compat, k8s, cloud tier) — https://github.com/agent-sandbox/agent-sandbox

Background landscape:
- restyler/awesome-sandbox — https://github.com/restyler/awesome-sandbox
- "List of coding agent sandboxes 2026-05" — https://gist.github.com/wincent/2752d8d97727577050c043e4ff9e386e
- "Your Container Is Not a Sandbox: MicroVM Isolation in 2026" — https://emirb.github.io/blog/microvm-2026/

---

**Document Version**: 1.3
**Created**: 2026-05-24
**Clarification Rounds**: 4 + 1 review pass (Codex P2s on PR #153)
**Quality Score**: 97/100

**Review pass (PR #153, Codex):** corrected the v0.7.0 baseline (pi is active, not deferred) and removed already-shipped work from future milestones — cross-runtime QA `run-all --runtimes` (shipped v0.7.x) and TUI polish UH-48..53 (shipped) are no longer scoped; capability enforcement scoped to the *new* manifest-`capabilities:` binding (vs the shipped `runtime_requirements` preflight); `oci_runtime` passthrough made conditional on the lean-OCI path (not OpenSandbox); friend dry-run runs in 1.0.0 (recruited in 0.10.0). The stale README/ROADMAP/CHANGELOG entries that caused the inflated baseline are corrected in the same PR.
