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
- **In scope (road to 1.0):** multi-runtime container sandbox backend, cross-runtime QA harness, Honcho MCP tools + opt-out, native Anthropic adapter, oh-my-pi→active, capability-declaration enforcement (**warn by default + `--strict`**), TUI/plugin polish (UH-48..53), the stability freeze + the adoption package.
- **Out of scope (post-1.0):** **Muta integration** — confirmed deferred entirely to the 1.x line (not a 1.0 blocker; needs a co-founder conversation first).

### Starting point (v0.7.0 — done)
5 active adapters (hermes, codex, hermes-proxy, openrouter) + `pi`; oh-my-pi experimental. Sandbox: git-worktree + directory backends (container = fail-fast stub, #137). verify-then-promote, capability-match enforcement on `runtime_requirements`, Honcho memory (codex/hermes), SDD/TDD, cost routing, Hermes plugin, docs site.

## Design Decisions

### Cadence
**Scope-driven** (no fixed dates). The expanded container scope (below) makes it a milestone of its own, giving a proposed four-release line: 0.8.0 → 0.9.0 → 0.10.0 → 1.0.0. 1.0 ships when its exit checklist is green.

### Container runtime research (informs 0.8.0)
Stakeholder asked for Docker + Podman parity, plus OrbStack / containerd / Colima / nerdctl, and a scan of recent (2025–2026) sandbox projects for the best option. Findings:

- **One CLI surface, not six.** Docker, Podman, and **nerdctl** (containerd's docker-compatible CLI) share the `docker`-style command surface; **OrbStack** and **Colima** expose a Docker-compatible socket. So the backend is **one OCI/docker-compatible code path + runtime auto-detection** (probe `docker`/`podman`/`nerdctl` on PATH + `DOCKER_HOST`/socket), not six bespoke integrations. containerd is reached via nerdctl.
- **2026 isolation trend: the microVM is the security boundary, not the container** — agent-written code can't be pre-reviewed, so plain namespaces are insufficient. Relevant local-first candidates: **microsandbox** (libkrun microVMs, local, ms-boot — superradcompany/microsandbox), **Kata Containers** (OCI runtime that puts each container in its own microVM — drops in under containerd/podman via `--runtime`), **Sysbox** (Daytona's harder-isolation runtime). Cloud options (E2B/Firecracker, Vercel/Cloudflare Sandboxes) are out of UH's local-first scope but validate the model.
- **macOS reality (Apple Silicon)**: Firecracker/KVM is Linux-only; on macOS, Docker Desktop / OrbStack / Colima already run containers inside a Linux VM (so there's a VM boundary by default), and libkrun/microsandbox use Virtualization.framework. The spike must document the isolation each path actually delivers per-OS.
- **Reference lists** (2026-05, exactly the requested window): `restyler/awesome-sandbox` + the "List of coding agent sandboxes 2026-05" gist — use as the spike's candidate set.

**Design implication:** `ContainerBackend` targets the docker-compatible CLI with runtime auto-detection + an explicit `runtime_config.container` block (`engine: auto|docker|podman|nerdctl`, `oci_runtime:` passthrough for `kata`/`runsc`/`sysbox`, `image:`). The **spike deliverable** picks the default isolation strategy (likely: docker-compatible CLI for portability + optional Kata/microsandbox for microVM-grade isolation) and writes it into `docs/architecture/sandbox-backends.md`. Reuse the bind-mount-a-`directory`-clone approach so dirty/promotion plumbing is unchanged; the container only isolates *execution*.

### Proposed milestone partition (dependency- + value-ordered)

| Milestone | Theme | Scope | Pillar |
|---|---|---|---|
| **v0.8.0** | **Sandbox isolation** | (1) container research spike → choose isolation strategy + write ADR; (2) multi-runtime `ContainerBackend` — OCI/docker-CLI auto-detect (docker/podman/nerdctl + orbstack/colima socket), `runtime_config.container` (engine + `oci_runtime` passthrough for kata/sysbox), evaluate microsandbox/libkrun as a local-microVM option; (3) **oh-my-pi → active** | Feature-complete |
| **v0.9.0** | **Cross-runtime QA & memory** | (1) `uh mission run-all --runtimes …` side-by-side diff/sentinel comparison (spans all active adapters); (2) Honcho `honcho_search`/`honcho_remember` as mission MCP tools + per-mission `runtime_config.honcho_memory` opt-out | Feature-complete |
| **v0.10.0** | **Adapter matrix, capability enforcement & DX** | (1) native Anthropic adapter (pay-per-token; ToS posture documented); (2) capability-declaration enforcement — manifest `capabilities:` validated (**warn by default, `--strict` errors**, mirroring `--strict-spec`); (3) TUI/plugin polish UH-48..53; (4) adoption package — quickstart + example-mission repo/dir + docs-completeness pass + screencast | Production plugin/DX + Adoption (build) |
| **v1.0.0** | **Stability** | (1) freeze + version + document all four public surfaces + deprecation policy + SemVer commitment (`docs/STABILITY.md` + CHANGELOG `[1.0.0]`); (2) **friend's external dry-run** against their repo — triage friction as blockers; (3) 1.0 release notes | Stability + Adoption (prove) |

**Why this order:** feature work that can still change schemas/CLI lands first (0.8–0.10) so the 1.0 freeze locks a settled surface; the external dry-run runs last against the frozen surface.

### Constraints
- **Container in CI**: Depot runners have no nested container/VM runtime → the container backend is verified via a documented **local** smoke (mirror the OpenRouter/pi "human runs the live smoke" pattern), not a blocking CI job. A CI job can run only if a runtime is available.
- **macOS vs Linux isolation** differs (above) — document per-path, don't over-promise microVM isolation where only a shared Linux VM exists.
- **Native Anthropic ToS**: official pay-per-token API key, documented posture (as with anthropic-via-omp).
- **Schema freeze is one-way**: get the surfaces right in 0.8–0.10; breaking a frozen surface after 1.0 costs a 2.0.

### Risk Assessment
- **Container backend is the heaviest, least-CI-verifiable item + now carries a research spike.** *Mitigation*: timebox the spike; ship behind the existing `SandboxBackend` iface with the stub as fallback; gate on a documented local smoke per engine.
- **Runtime matrix sprawl** (6 named tools). *Mitigation*: collapse to one docker-compatible CLI path + auto-detect; treat orbstack/colima/containerd as "detected, not bespoke."
- **Adoption bar depends on the friend's availability.** *Mitigation*: schedule the dry-run during 0.10.0; their friction log = 1.0 blockers.
- **Scope drift** (all four pillars + expanded container). *Mitigation*: the exit checklist below is the contract; off-list = post-1.0.

## Acceptance Criteria (v1.0 exit checklist)

### Pillar 1 — Stability
- [ ] All four surfaces documented as stable + versioned (artifact schemas, CLI, plugin API, capability contract); `docs/STABILITY.md` with `schema_version` bump + deprecation policy.
- [ ] CHANGELOG `[1.0.0]` states the SemVer stability commitment.

### Pillar 2 — Feature-complete core
- [ ] Container backend works end-to-end on ≥1 engine via documented local smoke (auto-detects docker/podman/nerdctl; orbstack/colima socket); `oci_runtime` passthrough verified for ≥1 microVM runtime (kata or microsandbox/libkrun).
- [ ] All shipped adapters `active` (no `experimental`); oh-my-pi graduated; native Anthropic present.
- [ ] Cross-runtime QA harness (`run-all --runtimes`) with side-by-side comparison.
- [ ] Honcho MCP tools (`honcho_search`/`remember`) + per-mission opt-out.
- [ ] Manifest `capabilities:` enforced (warn default, `--strict` errors).

### Pillar 3 — Production plugin + DX
- [ ] UH-48..53 shipped.
- [ ] Plugin `/api/uh/*` endpoints + manifest contract reviewed + frozen.

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
- [ ] Container research spike → ADR (pick isolation strategy across docker/podman/nerdctl/orbstack/colima/containerd + microVM option microsandbox/kata/sysbox).
- [ ] Multi-runtime `ContainerBackend` (auto-detect + `runtime_config.container`) + local smoke per available engine.
- [ ] oh-my-pi → `active`.
- **Deliverables**: real container backend + the active-adapter matrix. **Est.**: 1 milestone (spike-gated).

### Phase 2 — v0.9.0 "Cross-runtime QA & memory"
- [ ] `run-all --runtimes` side-by-side comparison.
- [ ] Honcho MCP tools + per-mission opt-out.
- **Deliverables**: cross-runtime QA + complete memory story. **Est.**: 1 milestone.

### Phase 3 — v0.10.0 "Adapter matrix, capability enforcement & DX"
- [ ] Native Anthropic adapter (+ runbook).
- [ ] Capability-declaration enforcement (warn + `--strict`).
- [ ] UH-48..53.
- [ ] Adoption package: quickstart + example repo + docs-completeness pass + screencast.
- **Deliverables**: complete adapter matrix, binding capabilities, polished DX, built adoption package. **Est.**: 1 milestone (heaviest; split if needed).

### Phase 4 — v1.0.0 "Stability"
- [ ] Freeze + document all four surfaces + deprecation policy + SemVer commitment.
- [ ] Friend's external dry-run; triage friction.
- [ ] Cut v1.0.0 + plugin-v1.0.0.
- **Deliverables**: stable, adoptable v1.0.0 on npm. **Est.**: 1 stabilization milestone.

## Resolved clarifications (round 3)
1. **Container runtimes** → Docker + Podman parity + OrbStack/containerd/Colima/nerdctl via one OCI/docker-CLI auto-detect path; microVM isolation (microsandbox/libkrun, Kata, Sysbox) evaluated in the 0.8.0 spike for the best local-first option.
2. **External adopter** → the lead's friend tests 1.0 against one of their own repos (Phase 4 bar).
3. **Muta** → entirely post-1.0.
4. **Capability enforcement** → warn by default + `--strict` (mirrors `--strict-spec`).

### Remaining sub-questions (resolve at phase start)
- 0.8.0: default isolation strategy + which microVM runtime is first-class (spike output).
- 0.10.0: is 0.10.0 one milestone or split (adapter+enforcement vs DX+adoption)?

## Research sources
- restyler/awesome-sandbox — https://github.com/restyler/awesome-sandbox
- "List of coding agent sandboxes 2026-05" — https://gist.github.com/wincent/2752d8d97727577050c043e4ff9e386e
- microsandbox (libkrun microVMs) — https://github.com/superradcompany/microsandbox
- E2B (Apache-2.0, Firecracker) — https://github.com/e2b-dev/E2B
- "Your Container Is Not a Sandbox: MicroVM Isolation in 2026" — https://emirb.github.io/blog/microvm-2026/

---

**Document Version**: 1.1
**Created**: 2026-05-24
**Clarification Rounds**: 3
**Quality Score**: 95/100
