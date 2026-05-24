# Container sandbox / OpenSandbox smoke runbook

Status: v0.8.0 #154 smoke passed after starting Docker Desktop; #155 uses mocked OpenSandbox mode in CI and this runbook for local evidence.

This runbook is the evidence surface for UH's `container` backend. It intentionally separates:

- **filesystem workspace isolation** — `git-worktree`, `directory`, optional future AgentFS;
- **execution process isolation** — OpenSandbox-managed command execution;
- **stronger secure-runtime isolation** — only claimable when OpenSandbox server validation proves a configured runtime such as gVisor/Kata/Firecracker on a supported host.

## Source references

- OpenSandbox overview: <https://open-sandbox.ai/overview/home>
- OpenSandbox server docs: <https://open-sandbox.ai/server/readme>
- OpenSandbox repository: <https://github.com/alibaba/OpenSandbox>
- OpenSandbox CLI package: <https://pypi.org/project/opensandbox-cli/>
- OpenSandbox server package: <https://pypi.org/project/opensandbox-server/>

## Required local smoke fields

Record these before claiming `container` is execution-isolated:

- Date/time.
- Host OS and architecture.
- Docker/OrbStack/Colima/Podman/runtime version.
- OpenSandbox server/CLI/SDK version.
- OpenSandbox runtime config (`runtime.type`, secure runtime type, docker runtime if any).
- Exact commands run.
- Sandbox id/output.
- Dirty-change observation.
- Teardown result.
- Claim permitted by the evidence.

## Canonical smoke flow

Use a temp config first so local smoke does not overwrite `~/.sandbox.toml`:

```sh
SMOKE_DIR="$(mktemp -d /tmp/uh-opensandbox-smoke.XXXXXX)"
CONFIG="$SMOKE_DIR/sandbox.toml"
OSB_CONFIG="$SMOKE_DIR/osb.toml"
LOG="$SMOKE_DIR/server.log"

uvx opensandbox-server init-config "$CONFIG" --example docker
SANDBOX_CONFIG_PATH="$CONFIG" uvx opensandbox-server >"$LOG" 2>&1 &
SERVER_PID=$!

curl http://127.0.0.1:8080/health

uvx --from opensandbox-cli osb --config "$OSB_CONFIG" config init
uvx --from opensandbox-cli osb --config "$OSB_CONFIG" config set connection.domain localhost:8080
uvx --from opensandbox-cli osb --config "$OSB_CONFIG" config set connection.protocol http
uvx --from opensandbox-cli osb --config "$OSB_CONFIG" config show -o json

CREATE_JSON=$(uvx --from opensandbox-cli osb --config "$OSB_CONFIG" sandbox create --image python:3.12 --timeout 10m -o json)
SID="<extract sandbox id from $CREATE_JSON>"
uvx --from opensandbox-cli osb --config "$OSB_CONFIG" command run "$SID" -o raw -- python -c "print(1 + 1)"
uvx --from opensandbox-cli osb --config "$OSB_CONFIG" file write "$SID" /workspace/uh-smoke.txt -c "hello-uh" -o json
uvx --from opensandbox-cli osb --config "$OSB_CONFIG" file cat "$SID" /workspace/uh-smoke.txt -o raw
uvx --from opensandbox-cli osb --config "$OSB_CONFIG" sandbox kill "$SID" -o json
kill "$SERVER_PID"
```

A future UH-level smoke, after #155 implementation, must additionally create a UH sandbox with `--backend container`, execute a harmless `uh verify` check through OpenSandbox, create a dirty file, confirm `uh sandbox status` reports it, confirm normal discard refuses dirty state, and confirm forced discard tears down both OpenSandbox state and the host working copy.

## Smoke attempts — 2026-05-24

### Environment

- Timestamp: `2026-05-24T22:29:05Z`.
- Host: macOS 26.4.1 (`25E253`), `arm64`.
- Python: `Python 3.14.4`; `uvx` used Python 3.12.10 internally for OpenSandbox packages.
- Docker CLI: `Docker version 29.4.3, build 055a478`.
- Docker context: `desktop-linux`.
- OpenSandbox CLI: `opensandbox, version 0.1.1` via `uvx --from opensandbox-cli osb --version`.

### Commands run

```sh
uvx opensandbox-server init-config /tmp/uh-opensandbox-smoke.dRGQbI/sandbox.toml --example docker
SANDBOX_CONFIG_PATH=/tmp/uh-opensandbox-smoke.dRGQbI/sandbox.toml uvx opensandbox-server
curl http://127.0.0.1:8080/health
```

### First result: Docker daemon unavailable

| Check | Result | Evidence |
|---|---|---|
| Generate OpenSandbox Docker config | PASS | `Wrote example config (docker) to /tmp/uh-opensandbox-smoke.dRGQbI/sandbox.toml` |
| Start OpenSandbox server | FAIL | Server exited before health check. |
| Docker daemon availability | FAIL | `failed to connect to the docker API at unix:///Users/eduardojaviergarcialopez/.docker/run/docker.sock` |
| OpenSandbox health endpoint | FAIL | `/health` never became reachable. |
| Sandbox create/command/file/kill | NOT RUN | Blocked by server startup failure. |

Blocking server error excerpt:

```text
DOCKER::INITIALIZATION_ERROR
Docker daemon seems unavailable (unix socket not found). Make sure Docker Desktop (or Colima/Rancher Desktop) is running.
current DOCKER_HOST=''
```

### Recovery result: Docker Desktop started and OpenSandbox smoke passed

After `open -a Docker`, `docker info` succeeded against Docker Desktop 29.4.3. The smoke was rerun in `/tmp/uh-opensandbox-smoke.I8jgt7` with `OPENSANDBOX_INSECURE_SERVER=YES` for local unauthenticated testing.

| Check | Result | Evidence |
|---|---|---|
| Docker daemon availability | PASS | `DOCKER_READY after 2s`; Docker Server Version `29.4.3` |
| OpenSandbox server startup | PASS | `Docker service initialized from environment`; `Application startup complete` |
| OpenSandbox health endpoint | PASS | `{"status":"healthy"}` |
| CLI config | PASS | `osb config show -o json` showed `localhost:8080` over `http` |
| Sandbox create | PASS | Sandbox id `7f019d6e-c55f-4a83-af6b-b51f8c12cf28`, image `python:3.12`, status `created` |
| Command execution | PASS | `osb command run ... python -c "print(1+1)"` printed `2` |
| File write/cat | PASS | Wrote `/workspace/uh-smoke.txt`; cat returned `hello-uh` |
| Teardown | PASS | `sandbox kill` returned status `terminated` |
| Secure runtime | NOT CONFIGURED | Server log: `Secure runtime is not configured.` |

### Claim permitted by this evidence

UH can claim OpenSandbox-managed Docker container command execution on this macOS host after Docker Desktop is running. Because the host is macOS with Docker Desktop and OpenSandbox reported no secure runtime configured, UH must not claim Firecracker/KVM/gVisor/Kata or direct Linux-kernel isolation from this smoke. Dirty-change round trip through UH is covered by mocked CI tests until the full `uh sandbox create --backend container` local smoke is rerun after integration.

## Troubleshooting

If Docker CLI exists but OpenSandbox reports a missing daemon socket:

1. Start Docker Desktop, OrbStack, Colima, or the intended Docker-compatible daemon.
2. Re-run `docker info` and confirm the `Server:` section succeeds.
3. If using Colima on macOS, set the socket before starting OpenSandbox, for example:

   ```sh
   export DOCKER_HOST="unix://${HOME}/.colima/default/docker.sock"
   SANDBOX_CONFIG_PATH="$CONFIG" uvx opensandbox-server
   ```

4. Re-run the canonical smoke flow and append a new dated result section above this troubleshooting section.

## Pivot rule

Do not pivot from OpenSandbox to a lean OCI/docker-CLI backend, ADR-only release, or AgentFS-first scope without lead confirmation. The first blocker was environmental Docker daemon availability and was resolved by starting Docker Desktop; it was not evidence that OpenSandbox is the wrong integration path.
