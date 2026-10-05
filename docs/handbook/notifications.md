# Notifications: settled runs, teams, and alerts

UH can tell its owner that a run finished or went wrong through any channel the operator has. **No route is the default:** with no configuration, nothing is sent, and the operator chooses every sink. Sources: `src/harness/notifications.ts`, `src/schema/project.ts`, `src/harness/live-runs.ts`, `src/harness/runtime-settlement.ts`, `src/harness/kill.ts`, `src/harness/team-run.ts`.

## Where sinks are configured

A sink is declared in either of two files:

- **Project** — the optional `notifications` section of `.harness/project.yaml` (schema `uh.project.v0`).
- **User** — the optional file `<user data>/notifications.yaml`, where the user data directory mirrors the guardian cache (`%LOCALAPPDATA%\ultimate-harness` on Windows, `$XDG_DATA_HOME/ultimate-harness` elsewhere). `UH_USER_DATA_DIR` overrides the location and `UH_NOTIFICATIONS_FILE` overrides the file itself.

Both files hold the same sink entries, but **their top-level shapes differ**: the project file nests them under `notifications`, the user file starts at a top-level `sinks` list. The sink list itself is parsed the same strict way in both, so a `notifications:` wrapper in the user file is a rejected document, and a bare `sinks:` list in the project file is silently not a `notifications` section at all. A project sink **overrides** a user sink with the same `id`; user sinks with unique ids are kept. A missing file contributes nothing.

`.harness/project.yaml`:

```yaml
schema_version: uh.project.v0
name: my-project
# …
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

`<user data>/notifications.yaml`:

```yaml
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
| `windows-toast` | command: `powershell -NoProfile -NonInteractive -WindowStyle Hidden -Command <script>` | — (Windows) | The script raises a toast through built-in Windows APIs (`Windows.UI.Notifications`), reading the message from stdin. It is raised under a **registered** AppUserModelID — Windows shows a desktop app's toast only for an id it knows and silently drops the rest — so the default is Windows PowerShell's own id, `{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe`. Set `app_id` to raise it under another registered id. |

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
- Every attempt is appended to `.harness/notifications/deliveries.ndjson` with its outcome (`ok`, `error`, or `timeout`), transport, what the success proved (`confirmation`), and detail. The ledger is also what makes delivery at-most-once across processes.

## What a success actually proves

`ok` means different things per sink, and `uh notify test` says which one it got instead of printing a flat `[OK]`:

| Report | Meaning |
|---|---|
| `[OK] <sink> (command): exited 0` | The command claimed success by its exit status. |
| `[OK] <sink> (webhook): HTTP 200 accepted` | The endpoint answered with a 2xx status. |
| `[HANDOFF] <sink> (command): handed to Windows (display cannot be confirmed)` | PowerShell accepted the toast and exited 0. Windows decides whether anything appears — the AppUserModelID has to be registered and the user's notification settings have to allow it — so this is a handoff, not a delivery. |
| `[FAIL] …` / `[TIMEOUT] …` | The concrete failure: non-zero exit and stderr, a non-2xx status, a spawn error, or the 15 s timeout. |

A handoff still counts as a successful attempt, so it does not fail the command's exit status; only `error` and `timeout` do.

## Commands

```
uh notify detect [--root path]            # which preset tools are installed here, with a ready-to-paste config for each
uh notify list [--root path]              # the configured sinks and their filters
uh notify test [--sink id] [--root path]  # deliver a test event and print what each sink confirmed
```

Every `notify` subcommand takes `--root`, like the rest of the CLI: it selects which `.harness/project.yaml` the sinks are read from (`detect` uses it only to name the file its suggested config is for).

`detect` looks for `hermes` and `apprise` on `PATH`, always offers `ntfy` (an ntfy sink needs only a URL), and offers `windows-toast` on Windows — but it also reads the user's global toggle, `ToastEnabled` under `HKCU\Software\Microsoft\Windows\CurrentVersion\PushNotifications`. When that value is `0` every toast is suppressed, so `detect` reports `windows-toast` unavailable with **"notifications are turned off in Windows settings"** rather than offering a sink that cannot show anything. A value UH cannot read (no `reg.exe`, an unreadable key) is never reported as off.

`test` bypasses the event/status filters and the at-most-once ledger so a sink can be checked deliberately; it exits non-zero when any sink did not report `ok`.

