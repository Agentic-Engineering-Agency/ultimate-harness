# hello-uh — your first verified mission

The smallest end-to-end Ultimate Harness mission. It takes you from a mission
packet to a **verified** change without any runtime credentials, so you can see
the whole loop before wiring up a real adapter. Target: under 10 minutes.

The mission's only job is to produce a `HELLO-UH.txt` file containing the marker
`hello-uh-ok`. Its acceptance criterion and verification gate are a trivial shell
check (`grep`) — no API keys, no network, no live model required.

## Prerequisites

- Node 20+ (every `uh` command except `uh tui` runs on Node) or Bun 1.3.14+.
- A clone of this repo, or the published CLI:
  `bun add -g @agenticengineeringagency/ultimate-harness`.

The commands below use the in-repo dev CLI (`bun run dev …`) so you can run the
example without a global install. If you installed the CLI globally, swap
`bun run dev` for `uh`.

## 1. Validate the packet

Confirm the mission packet parses against the schema. `uh validate` accepts a
file path directly, so this works before you initialize anything:

```sh
bun run dev validate examples/missions/hello-uh/mission.yaml
```

Expected output (exit code 0):

```
[PASS] examples/missions/hello-uh/mission.yaml
  schema: uh.mission.v0
```

(You may also see a `warn:` line about a missing `design.md` — that is advisory,
not a failure, and does not affect the exit code.)

## 2. Register the mission

`uh verify` looks the mission up by id under `.harness/missions/`, so copy the
packet into a harness project. In a fresh directory:

```sh
uh init
mkdir -p .harness/missions/hello-uh
cp examples/missions/hello-uh/mission.yaml .harness/missions/hello-uh/mission.yaml
```

(If you cloned this repo, run these from the repo root; `uh init` is idempotent.)

## 3. Run the mission

This packet's "work" is creating the marker file. A real runtime adapter would
do this for you; for the no-credentials walkthrough you can stand in for the
agent with a single shell command (this is exactly the change the mission
describes in `objective` / `expected_outputs`):

```sh
echo 'hello-uh-ok' > HELLO-UH.txt
```

If you have a runtime configured, you can instead drive it through an adapter:

```sh
uh mission run .harness/missions/hello-uh/mission.yaml --runtime codex
```

(Use `uh mission dry-run …` first to print the runtime command without executing it.)

## 4. Verify

Run the mission's verification gate by id:

```sh
bun run dev verify hello-uh
```

Expected output (exit code 0):

```
[verify] hello-uh
[verify] required-check hello-marker: PASS
[verify] verdict: PASS
```

## What success looks like

- `uh validate` exits 0 and prints `[PASS]`.
- After the marker file exists, `uh verify hello-uh` exits 0 and reports the
  `hello-marker` required check as `PASS` with `verdict: PASS`.
- If `HELLO-UH.txt` is missing or lacks the marker, `uh verify hello-uh` exits 1
  and reports `FAIL` — that is the gate doing its job.

## Cleanup

`HELLO-UH.txt` is a throwaway artifact (it is git-ignored). Remove it when done:

```sh
rm -f HELLO-UH.txt
```

## Next steps

- Read [docs/quickstart.md](../../../docs/quickstart.md) for the full
  `uh init` → `mission create` → `mission run` → `verify` lifecycle.
- Copy [the `implement-uh-slice` template](../templates/implement-uh-slice.yaml)
  to start a real mission with TDD enforcement and review gates.
- Pick a runtime adapter and follow its setup runbook under
  [docs/runbooks/](../../../docs/runbooks/).
