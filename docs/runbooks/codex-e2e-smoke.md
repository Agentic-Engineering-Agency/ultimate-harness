# Codex adapter — end-to-end smoke runbook

Status: **GATED ON QUOTA**. Last attempt failed with `You've hit your usage limit. Visit https://chatgpt.com/codex/settings/usage to purchase more credits.` The adapter classified that correctly as `runtime-result.status: blocked`.

This runbook is the minimum-cost path to flip the Codex manifest from `experimental` → `active` once ChatGPT subscription credits are available.

## Preconditions

1. `codex --version` reports `codex-cli 0.130.0` or newer.
2. The local Codex account has remaining subscription quota. Verify at https://chatgpt.com/codex/settings/usage.
3. Repo is on a clean branch off `dev`. Suggested branch: `chore/codex-e2e-smoke`.
4. `dist/` is up to date: `bun run build`.

## One-shot smoke

```bash
# 1. Allocate a sandbox bound to the mission
node dist/cli.js sandbox create codex-smoke-sb \
  --mission codex-e2e-smoke

# 2. Run the mission against the real Codex CLI
node dist/cli.js mission run \
  .harness/missions/codex-e2e-smoke/mission.yaml \
  --runtime codex

# 3. Verify
node dist/cli.js verify codex-e2e-smoke
```

Expected end-state:
- `.harness/missions/codex-e2e-smoke/runtime-result.yaml` has `status: passed`.
- `.harness/missions/codex-e2e-smoke/runtime-final.txt` contains a one-paragraph summary.
- `.harness/missions/codex-e2e-smoke/diff.patch` contains exactly one new file: `docs/codex-smoke.txt`.
- `verify` reports `[PASS]`.

## Flip manifest to `active`

After the smoke succeeds, edit:
- `.harness/adapters/codex.yaml`: `status: experimental` → `status: active`.
- `src/harness/adapter-add.ts`: same change in the Codex template.
- `docs/architecture/adapter-codex.md`: append a dated `Promoted to active` paragraph under the implementation status section.
- `docs/status-dashboard.html`: move Codex from the experimental row to the active row.
- Tests: extend `tests/codex.test.ts` with a manifest-loader assertion `expect(adapter.status).toBe('active')`.

Open a PR titled `chore(codex): promote adapter to active after E2E smoke` and link the runtime-result.yaml + final.txt + diff.patch as evidence.

## Failure modes and how to read them

| Symptom | Where it shows up | Action |
|---|---|---|
| `runtime-result.status: blocked`, error contains `usage limit` / `purchase more credits` | stdout/stderr → `errors[]` | Quota exhausted. Top up subscription. Re-run from step 2. |
| `runtime-result.status: blocked`, error: `Codex did not write --output-last-message` | exit 0 but final file absent | Codex CLI version regression. Inspect `runtime.stdout.log` (JSONL events). File issue upstream if reproducible. |
| `runtime-result.status: failed`, `Spawn error: ENOENT` | stderr | `codex` not on PATH. `command -v codex` to confirm; reinstall via `brew install --cask codex`. |
| `runtime-result.status: failed`, exit non-zero, no quota text | stderr | Read `runtime.stderr.log` and the trailing `turn.failed` event in `runtime.stdout.log`. |
| Diff is empty but Codex reported success | `diff.patch` zero bytes | Codex did not modify the worktree. Inspect `runtime-final.txt` for "I would have written ..." — usually a sandbox or approval mismatch. Re-check `--sandbox workspace-write` made it into args. |

## Re-running after a partial failure

The sandbox stays bound to the mission. To retry without rebuilding state:

```bash
node dist/cli.js sandbox status codex-smoke-sb
node dist/cli.js mission run \
  .harness/missions/codex-e2e-smoke/mission.yaml \
  --runtime codex
```

To start completely fresh:

```bash
node dist/cli.js sandbox discard codex-smoke-sb --force
rm -rf .harness/missions/codex-e2e-smoke
node dist/cli.js mission create codex-e2e-smoke \
  --title "Codex E2E Smoke" \
  --workflow research-docs \
  --objective "Single timestamp marker file" \
  --force
cp examples/missions/codex-e2e-smoke.yaml \
   .harness/missions/codex-e2e-smoke/mission.yaml
```

(Or just copy `examples/missions/codex-e2e-smoke.yaml` into place once — it is the source of truth for the smoke mission packet.)

## Why this mission

- Single expected artifact (`docs/codex-smoke.txt`). Minimizes token spend on the real Codex backend.
- Verification check is a one-liner: file exists + contains an ISO 8601 timestamp.
- Diff is trivially reviewable — one new file with one line.
- Exercises every adapter path: planner, runner, JSONL parse, final-message capture, diff capture, runtime-result emission, verify routing into the sandbox worktree.

## Acceptance for promotion

The Codex adapter is promoted to `active` only after **all** of:

1. One real `mission run --runtime codex` run with `runtime-result.status: passed`.
2. `verify` returns `[PASS]`.
3. `runtime-final.txt` is non-empty and contains a coherent summary.
4. `diff.patch` contains the expected single file.
5. No silent fallbacks observed — quota/auth/missing-binary still produce `blocked` not `passed`.
6. `bun run test` green (no regressions in the experimental → active transition).
