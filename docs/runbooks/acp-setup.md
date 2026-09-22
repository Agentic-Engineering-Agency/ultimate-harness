# ACP (Agent-Client Protocol) Setup Runbook

Ultimate Harness provides native support for **ACP v1 (Agent-Client Protocol)**, allowing UH to orchestrate external ACP-compliant agent processes (e.g. OpenHands, Zed agents, or custom ACP servers) through standard JSON-RPC 2.0 over standard I/O.

---

## 1. Prerequisites

1. An executable agent that implements ACP v1 (reads JSON-RPC on `stdin`, writes on `stdout`).
2. The agent command accessible in `PATH` or configured via `server_command`.

---

## 2. Adapter Configuration

The adapter manifest is located at `.harness/adapters/acp.yaml`.

```yaml
schema_version: uh.adapter.v0
id: acp
name: Agent-Client Protocol (ACP)
description: Native ACP v1 runner for headless agent orchestration
runtime: acp
capabilities:
  - cli-execution
  - json-output
  - diff-output
status: active
config:
  server_command: acp-agent
  server_args: []
  protocol_version: 1
  timeout_ms: 600000
```

### Runtime Configuration Options

* `server_command` (string, default: `"acp-agent"`): The binary or script invoked by UH.
* `server_args` (string[], default: `[]`): Command line arguments passed to the ACP server.
* `protocol_version` (integer, default: `1`): ACP protocol version (v1).
* `timeout_ms` (integer, default: `600000`): Per-request timeout in milliseconds.

---

## 3. Mission Usage

### Single Mission
In your mission packet:
```yaml
schema_version: uh.mission.v0
id: sample-acp-mission
title: "Run task via ACP"
workflow_profile: bugfix-contained
runtime_config_overrides:
  server_command: my-acp-binary
  timeout_ms: 300000
```

Execute with:
```bash
uh mission run .harness/missions/sample-acp-mission/mission.yaml --runtime acp
```

### Team Mission
ACP is also a first-class team worker adapter:
```yaml
schema_version: uh.mission.v0
id: sample-team-acp
shape: team
team:
  leader:
    adapter: command-code
    role: leader
  workers:
    - adapter: acp
      role: worker-acp
      objective: "Implement headless task via ACP"
```

---

## 4. Verification and Governance

When UH executes an ACP mission:
1. It validates the ACP handshake (`initialize`).
2. Spawns the agent within the isolated sandbox boundary.
3. Services agent-to-client permission requests (`session/request_permission`) according to harness policy.
4. Records canonical run facts (`runtime-result.yaml`, `diff.patch`, `stdout`, `stderr`, and `runs/index.json`).
