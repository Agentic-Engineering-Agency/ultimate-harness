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

The adapter invokes: `pi --print --mode <mode> --no-session [--no-extensions] [--no-skills] --no-title <prompt>`.

> **Flag-surface note.** This adapter mirrors `oh-my-pi`'s non-interactive
> contract. If your `pi` build's flags differ (e.g. a different version probe or
> output mode), adjust `config.cli_command` / `runtime_config` or open an issue —
> the v0.7.0 adapter was unit-tested against the mocked contract; confirm one
> live `uh mission run --runtime pi` before relying on it.

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
