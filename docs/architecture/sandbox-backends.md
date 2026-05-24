# Sandbox backends (ADR)

Status: accepted (S3 #136 ships `git-worktree` + `directory`; S4 #137 registers `container` as a fail-fast stub).

## Context

A *sandbox* is an isolated working copy of the repo where an agent executes a
mission; the harness then inspects the result (dirty changes) and optionally
promotes it. Until v0.6.0 the only sandbox was a `git worktree`. Different
missions want different isolation/cost trade-offs, so `src/harness/sandbox.ts`
now delegates the mechanics to a `SandboxBackend` (`src/harness/sandbox-backends.ts`):

```ts
interface SandboxBackend {
  name: string;
  materialize(ctx): Promise<{ branch; base_ref }>;   // create the working copy
  teardown(ctx, opts): Promise<{ branch_removed }>;  // remove it
  collectDirtyChanges(worktreePath): Promise<string[]>; // porcelain dirt list
}
```

The orchestrator keeps the cross-cutting concerns (index, metadata, path-safety,
the UH-29 mission seed, dirty-gating on discard); each backend only implements
materialize / teardown / dirty. Selection is `uh sandbox create --backend <name>`
(default `git-worktree`), persisted in the sandbox record's `backend` field.

## Backends

| Backend | Isolation | Cost | Parent-repo coupling | Status |
|---|---|---|---|---|
| `git-worktree` | shares object store, dedicated `sandbox/<id>` branch in the **parent** repo | cheapest | registers in the parent's worktree list + branch namespace | **shipped** |
| `directory` | self-contained local clone (hard-linked objects) on its own `sandbox/<id>` branch | cheap | **none** — discard is a plain dir removal; survives parent gc/branch churn | **shipped** |
| `container` | full OS-level isolation (separate FS + process namespace) | highest (image pull/build, runtime) | none | **stub — not yet wired** |

### Why `directory` in addition to `git-worktree`

`git worktree` is great until the parent repo's branch namespace or worktree
registry is contended (parallel agents, gc, branch churn). The `directory`
backend is a `git clone --local` — an independent checkout whose `sandbox/<id>`
branch lives *inside the clone*, so teardown is just `rm -rf` and there is
nothing to unregister in the parent. Dirty detection is still `git status` in
the clone, so promotion semantics are unchanged.

## The `container` backend (deferred)

Registered in the backend table so `--backend container` resolves and **fails
fast with an actionable message** (`docs` pointer) rather than being an "unknown
backend" or silently degrading. It is not implemented because:

- There is **no container runtime in CI** (Depot Linux runners don't expose a
  Docker daemon to the test process), so an implementation could not be verified
  in the pipeline today.
- The materialization strategy needs a decision (below) that benefits from a
  real use case before committing.

### Proposed design (when prioritized)

- **Runtime:** Docker first (Podman-compatible CLI), detected via `docker info`;
  fail fast if absent.
- **Image:** a thin base (repo toolchain: bun + node + git) pinned by digest;
  project-overridable via `mission.sandbox.config.image`.
- **Materialize:** `git clone --local` into a host dir (as `directory`), then run
  the agent in a container that **bind-mounts** that dir as the workdir. The
  working copy stays on the host so dirty-detection + promotion reuse the
  `directory` backend's `git status` path verbatim — the container only isolates
  *execution*, not the file store. (A pure copy-in/copy-out variant was rejected:
  it duplicates the dirty/diff plumbing and complicates promotion.)
- **Teardown:** remove the container, then the host dir (as `directory`).
- **Dirty:** `git status` on the host dir — identical to `directory`.

This keeps the container backend a thin execution wrapper over `directory`,
minimizing new surface area.
