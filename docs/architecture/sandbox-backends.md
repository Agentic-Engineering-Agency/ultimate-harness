# Sandbox backends (ADR)

Status: accepted for v0.7.0 (`git-worktree` + `directory` shipped; `container` registered as a fail-fast stub) and updated for the v0.8.0 sandbox-isolation spike (#154).

## Decision summary

Ultimate Harness uses a two-tier sandbox model:

1. **Filesystem tier** — where the repo working copy lives and how dirty changes are inspected.
2. **Execution tier** — where mission and verification commands actually run.

For v0.8.0, UH keeps the shipped filesystem backends (`git-worktree` and `directory`) as the baseline and selects **OpenSandbox local Docker mode** as the first execution-isolation candidate for the `container` backend. The `container` backend must not be called complete until `uh mission run` / `uh verify` command execution is routed through OpenSandbox or fails explicitly as unsupported.

No fallback to a lean in-house OCI/docker-CLI backend is authorized unless the lead confirms that pivot after OpenSandbox evidence is reviewed. Kubernetes/cloud sandbox projects stay out of v0.8.0 and belong to a post-1.0 cloud tier.

## Context

A *sandbox* is an isolated working copy of the repo where an agent executes a mission; the harness then inspects the result (dirty changes) and optionally promotes it. Until v0.6.0 the only sandbox was a `git worktree`. Different missions want different isolation/cost trade-offs, so `src/harness/sandbox.ts` delegates mechanics to a `SandboxBackend` (`src/harness/sandbox-backends.ts`):

```ts
interface SandboxBackend {
  name: string;
  materialize(ctx): Promise<{ branch; base_ref }>;   // create the working copy
  teardown(ctx, opts): Promise<{ branch_removed }>;  // remove it
  collectDirtyChanges(worktreePath): Promise<string[]>; // porcelain dirt list
}
```

The orchestrator keeps the cross-cutting concerns (index, metadata, path-safety, UH-29 mission seeding, dirty-gating on discard). Each backend owns materialize / teardown / dirty mechanics. Selection is `uh sandbox create --backend <name>` (default `git-worktree`) and is persisted in the sandbox record's `backend` field.

## Backends

| Backend | Tier | Isolation claim | Parent-repo coupling | Status |
|---|---|---|---|---|
| `git-worktree` | Filesystem | Shared object store, dedicated `sandbox/<id>` branch in the parent repo | Registers in the parent's worktree list + branch namespace | **shipped** |
| `directory` | Filesystem | Self-contained local clone (hard-linked objects) on its own `sandbox/<id>` branch | None; discard is a plain directory removal | **shipped** |
| `container` | Execution | OpenSandbox-managed command execution when configured; host working copy alone is not execution isolation | None intended | **implemented behind OpenSandbox configuration (#155)** |
| `agentfs` | Filesystem | Optional/deferred copy-on-write filesystem/state/audit backend; not execution isolation | TBD | **deferred** |

## Decision drivers

- **Evidence-bounded claims.** UH may only claim the isolation boundary proven by local smoke and recorded runtime observations.
- **Seam preservation.** `sandbox.ts` remains orchestration. Provider-specific OpenSandbox details must stay behind backend-focused code or focused helpers.
- **Fail-fast over fallback.** Missing OpenSandbox/server/runtime/config must fail actionably. It must never downgrade silently to `directory` or `git-worktree`.
- **Release honesty.** v0.8.0 should not ship a “container” story that is only host filesystem materialization.

## Why OpenSandbox first

OpenSandbox is the chosen v0.8 execution-tier candidate because its documented local path already provides a server, CLI, SDKs, command/file APIs, Docker runtime, and optional secure runtime configuration. That concentrates the runtime matrix outside UH and lets UH adapt to one execution API instead of owning Docker/Podman/nerdctl/OrbStack/Colima behavior directly.

The planned UH implementation should:

- keep `ContainerBackend.name === "container"` for CLI compatibility;
- use OpenSandbox as the provider identity in docs/runtime evidence;
- reuse `directory`-style host materialization only as the auditable working copy;
- route `uh mission run` and `uh verify` command execution through an OpenSandbox runner seam;
- preserve porcelain-compatible dirty detection and existing discard/promotion semantics;
- fail before index writes and clean partial sandbox dirs if OpenSandbox create/start/config fails.

## Alternatives considered

| Alternative | Decision | Rationale |
|---|---|---|
| Lean in-house OCI/docker-CLI backend | Rejected as default; lead-confirmed fallback only | Smaller dependency footprint, but expands UH-owned security/runtime surface across Docker-compatible CLIs. |
| ADR-only v0.8 release | Rejected unless lead accepts scope reduction | Does not satisfy the credibility milestone while `container` remains a stub. |
| AgentFS as required v0.8 backend | Deferred | AgentFS improves filesystem/state/audit isolation, but it does not solve execution isolation. |
| Kubernetes/cloud sandbox now | Rejected for v0.8 | Roadmap keeps cloud/cluster tier post-1.0. |

## Per-OS claim boundaries

| Host/runtime evidence | Permitted UH claim | Not permitted |
|---|---|---|
| macOS + Docker Desktop/OrbStack/Colima + OpenSandbox Docker runtime | Commands execute in OpenSandbox-managed Docker containers behind the host's Linux VM boundary. | Firecracker/KVM/microVM isolation on macOS. |
| Linux + Docker runtime only | Commands execute in OpenSandbox-managed Docker containers using Linux container isolation. | Firecracker/KVM/gVisor/Kata unless configured and smoked. |
| Linux + OpenSandbox secure runtime validation for runsc/Kata/Firecracker | The exact secure runtime observed in smoke, scoped to that host. | Universal secure-runtime support across all hosts. |
| No OpenSandbox server/runtime smoke | No execution-isolation claim; `container` remains blocked/stubbed. | Any claim that mission/verify commands are isolated. |

## #154 local smoke results (2026-05-24)

See [`docs/runbooks/container-sandbox.md`](../runbooks/container-sandbox.md) for commands and raw evidence summary.

- Host: macOS 26.4.1, arm64.
- Docker CLI: `Docker version 29.4.3, build 055a478`.
- OpenSandbox server config generation: **PASS** via `uvx opensandbox-server init-config /tmp/.../sandbox.toml --example docker`.
- First OpenSandbox server startup: **FAIL**. The server exited before `/health` because the Docker daemon socket was unavailable.
- Recovery: launching Docker Desktop made `docker info` succeed.
- Second OpenSandbox server startup: **PASS**. `/health` returned `{"status":"healthy"}`.
- Sandbox lifecycle smoke: **PASS**. `osb sandbox create --image python:3.12`, `osb command run ... python -c "print(1+1)"`, file write/cat, and `osb sandbox kill` all succeeded.
- Secure runtime observation: OpenSandbox reported `Secure runtime is not configured`; the permitted claim is Docker-container execution behind the macOS Docker Desktop Linux VM boundary, not Firecracker/KVM/gVisor/Kata.

### Consequence

#155 may proceed on the OpenSandbox-first path. No lean OCI/docker-CLI pivot is authorized by this ADR update.

## #157 lifecycle hardening

- `runOpenSandboxTemplate` spawns each command in the sandbox-bound `cwd` (the host worktree) rather than `process.cwd()` so `verify`/create/delete templates with relative paths resolve against the sandbox, not the caller's shell.
- `ContainerBackend.teardown` runs `UH_OPENSANDBOX_DELETE_COMMAND` unconditionally when configured; forced/orphan discards spawn from `ctx.root` when the worktree has already been removed so external sandbox resources cannot leak.
- Lifecycle timeouts (create/delete) are configurable via `UH_OPENSANDBOX_LIFECYCLE_TIMEOUT_MS` (positive integer, milliseconds). Default is `30000`. Per-command `verify` timeouts continue to come from the mission spec.
