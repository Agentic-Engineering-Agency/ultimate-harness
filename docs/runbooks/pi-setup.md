# pi setup

The `pi` adapter drives the vanilla **`pi` agent CLI** — the base CLI that
`oh-my-pi` (`omp`) extends. It is a sibling of the `oh-my-pi` adapter: same
non-interactive JSON contract, different binary.

## 1. Install pi + add the manifest

Ensure the `pi` binary is on `PATH` (set `config.cli_command` if it's named
differently), then:

```bash
uh adapter add pi
uh adapter check pi    # runs `pi --version`
```

`config.runtime_config` keys (strict — typos rejected at load):

| Key | Default | Notes |
|---|---|---|
| `mode` | `json` | `json` / `text` / `rpc` (use `json` for headless) |
| `thinking` | `""` | `minimal`/`low`/`medium`/`high`/`xhigh` |
| `allow_extensions` | `false` | enable pi extensions |
| `allow_skills` | `false` | enable pi skills |
| `model` | — | model override |

The adapter invokes: `pi --print --mode <mode> --no-session [--no-extensions] [--no-skills] <prompt>` (the prompt is a positional arg). Verified against `pi --help` (v0.73.1).

> **Provider/auth note.** `pi` defaults to the `google` provider and reads API
> keys from env vars; set `--provider`/`--model` via `runtime_config_overrides`
> and export the matching key before a live run. The v0.7.0 adapter is
> unit-tested with a mocked runner; confirm one live `uh mission run --runtime
> pi` against your provider before relying on it.

## 2. Run

```bash
uh mission dry-run <mission> --runtime pi
uh mission run <mission> --runtime pi
```

Per-mission overrides via `runtime_config_overrides` (e.g. `model:`, `mode:`).

## Relationship to oh-my-pi

`oh-my-pi` (`omp`) stays a separate adapter (and remains `experimental` — see
[`anthropic-via-omp.md`](./anthropic-via-omp.md) for its ToS posture). Use `pi`
for the base CLI, `oh-my-pi` for the OMP distribution.
