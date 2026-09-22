# Model Context Protocol (MCP) Server

Operator runbook for running and integrating the Ultimate Harness Model Context Protocol (MCP) server.

---

## 1. Overview

The `uh mcp serve` command launches a local, read-only MCP server communicating over newline-delimited JSON-RPC 2.0 via standard input and standard output (`stdio`).

It allows external MCP host applications (e.g. Claude Desktop, Cursor, Command Code, or custom orchestrators) to inspect harness project status, query historical mission runs, and review run artifacts without executing agent runtimes or altering local files.

### Key Properties

- **Strictly read-only**: Tools inspect local state and metadata only. No tool executes a runtime adapter, writes or modifies files, creates sandboxes, renders prompts, or spends tokens.
- **Clean stdio contract**: Only valid JSON-RPC protocol messages are emitted on `stdout`. Informational logs, banners, and update notices are suppressed. Diagnostics and fatal errors are routed strictly to `stderr`.
- **Lifecycle**: The server listens on `stdin` for requests until `stdin` closes (EOF), then exits cleanly with status code `0`.
- **Path confidentiality**: Absolute filesystem paths are never leaked over protocol responses. All emitted paths are normalized relative to the project root.

---

## 2. CLI Usage

```bash
# Serve the current working directory as project root
uh mcp serve

# Serve an explicit project root
uh mcp serve --root /path/to/project
```

### Options

| Option | Default | Description |
|---|---|---|
| `--root <path>` | Current working directory (`cwd`) | Path to the target Ultimate Harness repository root. |

---

## 3. Protocol Support & Exposed Tools

The server supports modern and legacy MCP protocol versions:
- `2026-07-28` (stateless negotiation via `server/discover`, per-request version meta, cache hints)
- `2025-11-25` (stateful handshake via `initialize`, `notifications/initialized`, `ping`)

### Supported Methods

- `server/discover`: Discovers server capabilities, metadata, and supported protocol versions.
- `initialize`: Performs client/server capability handshake for legacy clients.
- `ping`: Health check returning an empty completion result.
- `tools/list`: Lists available tools with JSON schemas and usage hints.
- `tools/call`: Executes an authorized read-only tool.

### Exposed Tools

The server registers exactly three read-only tools:

1. **`uh_status`**
   - **Description**: Returns project initialization state, total mission count, registered sandbox count, active adapters, unpromoted work, and harness version.
   - **Arguments**: None (`{}`).

2. **`uh_runs`**
   - **Description**: Lists indexed mission runs or summarizes run groups with Pareto frontier trade-offs.
   - **Arguments**:
     - `mission_id` (optional string): Filter runs by mission identifier.
     - `group_by` (optional enum): Group and aggregate runs by `runtime`, `model`, `workflow_profile`, or `stop_code`.

3. **`uh_run`**
   - **Description**: Retrieves record metadata and identifies available artifact files (e.g., `events.ndjson`, `runtime-result.yaml`, `verification.yaml`) for a specific mission run.
   - **Arguments**:
     - `mission_id` (required string): Mission identifier.
     - `run_id` (required string): Run identifier.

---

## 4. Host Configuration

To register the Ultimate Harness MCP server in an MCP-compliant client, add a server entry using the `uh` executable.

### Generic MCP Host Configuration Example

```json
{
  "mcpServers": {
    "ultimate-harness": {
      "command": "uh",
      "args": [
        "mcp",
        "serve",
        "--root",
        "/path/to/project"
      ]
    }
  }
}
```

Replace `/path/to/project` with the path to your target project root. If the client launches `uh` directly inside the repository working directory, `--root` may be omitted:

```json
{
  "mcpServers": {
    "ultimate-harness": {
      "command": "uh",
      "args": [
        "mcp",
        "serve"
      ]
    }
  }
}
```
