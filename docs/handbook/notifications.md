# Notifications: settled runs, teams, and alerts

UH can tell its owner that a run finished or went wrong through any channel the operator has. **No route is the default:** with no configuration, nothing is sent, and the operator chooses every sink. Sources: `src/harness/notifications.ts`, `src/schema/project.ts`, `src/harness/live-runs.ts`, `src/harness/runtime-settlement.ts`, `src/harness/kill.ts`, `src/harness/team-run.ts`.

## Where sinks are configured

A sink is declared in either of two files:

- **Project** — the optional `notifications` section of `.harness/project.yaml` (schema `uh.project.v0`).
- **User** — the optional file `<user data>/notifications.yaml`, where the user data directory mirrors the guardian cache (`%LOCALAPPDATA%\ultimate-harness` on Windows, `$XDG_DATA_HOME/ultimate-harness` elsewhere). `UH_USER_DATA_DIR` overrides the location and `UH_NOTIFICATIONS_FILE` overrides the file itself.

Both files hold the same shape: a top-level `sinks` list. A project sink **overrides** a user sink with the same `id`; user sinks with unique ids are kept. A missing file contributes nothing.

```yaml
notifications:
  sinks:
    - id: desktop
      preset: windows-toast
      events: ["*"]
    - id: phone
      preset: hermes
      to: "@owner"
      events: [run.settled, alert]
      filter:
        statuses: [failed, blocked]
        missions: ["wave-*"]
```

Every sink carries an `id`, an `events` list, and an optional `filter` (`statuses` and `missions` globs). An omitted `events` list subscribes to everything; a declared `filter.statuses` only matches events that carry a status in the list, and `filter.missions` only matches events whose mission id matches one of the globs.

## The two kinds

Only two sink kinds exist in code; presets are data that expand to one of them.

### `command`

An `argv` array — spawned **directly, never through a shell** — with the rendered message written to stdin and the event JSON exported in an environment variable (`env`, default `UH_NOTIFICATION_EVENT`). Every argv item may use `{subject}` and `{event}` placeholders. Child processes are spawned with `windowsHide`, so no console window appears.

```yaml
- id: log
  kind: command
  argv: ["my-notifier", "--subject", "{subject}"]
  env: MY_EVENT_JSON
  events: ["*"]
```

### `webhook`

A request whose `body` is the event JSON (or the text message when `body: text`). Header **values name environment variables**, resolved at delivery time — a credential literal is never written into the file.

```yaml
- id: slack
  kind: webhook
  url: https://hooks.example.invalid/services/T000
  method: POST
  headers:
    Authorization: SLACK_WEBHOOK_TOKEN
  events: [run.settled, team.settled, run.orphaned, alert]
```

## Presets

Presets are a small data table, documented here and in `src/harness/notifications.ts`. UH never reads or stores platform credentials; hermes and apprise keep their own.

| Preset | Expands to | Requires | Notes |
|---|---|---|---|
| `hermes` | command: `hermes send --to <to> --subject {subject} --quiet --file -` | `to` | Delivers to any platform Hermes is configured for (Telegram, Discord, Slack, Signal, WhatsApp, …) using Hermes's own credentials; no model and no running gateway. |
| `apprise` | command: `apprise -t {subject} -b - <urls>...` | `urls` | The body is read from stdin (`-b -`). **Not verified locally** — apprise was not installed on the machine this shipped from; this follows apprise's documented CLI. |
| `ntfy` | webhook: `POST <server>/<topic>`, text body, `Title: {subject}` | `server`, `topic` | The server is any ntfy server. |
| `windows-toast` | command: `powershell -NoProfile -NonInteractive -WindowStyle Hidden -Command <script>` | — (Windows) | The script shows a toast through built-in Windows APIs (`Windows.UI.Notifications`) reading the message from stdin. |

A preset sink names `preset` instead of `kind`, and may still set `events` and `filter`.

## Events

UH emits these at its settlement points:

- **`run.settled`** — a run reached a terminal status. Fields: `run_id`, `mission`, `runtime`, `model`, `status`, `stop_code`, `duration_ms`, `files_written`, `summary`.
- **`team.settled`** — a team run finished; carries the overall team status and the files written across its workers.
- **`run.orphaned`** — a run's controller process is gone and the run was closed as lost.
- **`alert`** — a supervision stop, raised with stop code `policy`, `stall`, `repeated_failure`, `denial_budget`, or `controller_lost` (in addition to the run's own settlement event).

The settlement points are `settleLiveRun`'s callers (`src/harness/runtime-settlement.ts`, `src/harness/kill.ts`, `src/harness/live-runs.ts`) and `runTeamMission` (`src/harness/team-run.ts`).

## Delivery guarantees

Delivery is asynchronous and best effort — **it never delays or fails a settlement**:

- Each sink gets a hard 15 s timeout.
- Each `(event, run id, sink)` is delivered **at most once**.
- Every attempt is appended to `.harness/notifications/deliveries.ndjson` with its outcome (`ok`, `error`, or `timeout`), transport, and detail. The ledger is also what makes delivery at-most-once across processes.

## Commands

```
uh notify detect          # which preset tools are installed here, with a ready-to-paste config for each
uh notify list            # the configured sinks and their filters
uh notify test [--sink id]  # deliver a test event and print each sink's outcome
```

`detect` looks for `hermes` and `apprise` on `PATH`, always offers `ntfy` (an ntfy sink needs only a URL), and offers `windows-toast` on Windows. `test` bypasses the event/status filters and the at-most-once ledger so a sink can be checked deliberately; it exits non-zero when any sink did not report `ok`.
