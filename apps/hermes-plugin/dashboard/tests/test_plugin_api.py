"""UH-62 backend smoke + edge cases.

We don't test through a real `uh` binary — those are covered by the existing
TypeScript adapter tests and the e2e smoke. These tests pin the *shapes* the
frontend depends on: endpoint payloads, error JSON, path-traversal rejection,
and SSE delivery.
"""
from __future__ import annotations

import asyncio
import json
import textwrap
from pathlib import Path
from typing import Any

import httpx
import pytest
import yaml


pytestmark = pytest.mark.asyncio


@pytest.mark.asyncio
async def test_status_returns_project_adapters_and_counts(client: httpx.AsyncClient, isolated_project: Path) -> None:
    resp = await client.get("/api/plugins/uh/status")
    assert resp.status_code == 200
    body = resp.json()
    assert body["project_name"] == "testproj"
    assert body["schema_version"] == "uh.project.v0"
    assert body["workflows"] == 1
    assert body["missions"]["active"] == 1
    adapter_ids = [a["id"] for a in body["adapters"]]
    assert adapter_ids == ["hermes"]
    # Without `uh` actually present, check is best-effort — entry exists but
    # may not have a check block. Tested separately below with a fake stdout.


@pytest.mark.asyncio
async def test_status_adapter_check_merges_stdout(client: httpx.AsyncClient, isolated_project: Path, fake_cli: Any) -> None:
    fake_cli.stub(
        ("adapter", "check"),
        stdout=textwrap.dedent(
            """
            [PASS] hermes adapter
              runtime: hermes
              version: 0.14.2
            """
        ).strip() + "\n",
    )
    resp = await client.get("/api/plugins/uh/status")
    assert resp.status_code == 200
    body = resp.json()
    hermes = next(a for a in body["adapters"] if a["id"] == "hermes")
    assert hermes["check"] == {"ok": True, "version": "0.14.2"}
    # Verify the CLI was invoked with the right args and timeout.
    matching = [c for c in fake_cli.calls if c["args"] == ["adapter", "check"]]
    assert matching
    assert matching[0]["timeout"] > 0


@pytest.mark.asyncio
async def test_missions_list_and_detail(client: httpx.AsyncClient, isolated_project: Path) -> None:
    resp = await client.get("/api/plugins/uh/missions")
    assert resp.status_code == 200
    missions = resp.json()["missions"]
    assert [m["id"] for m in missions] == ["demo"]
    assert missions[0]["workflow_profile"] == "research-docs"

    detail = (await client.get("/api/plugins/uh/missions/demo")).json()
    assert detail["id"] == "demo"
    assert detail["acceptance_criteria"][0]["id"] == "ac-1"
    assert detail["expected_artifacts"][0]["path"] == "docs/demo.txt"
    assert "schema_version: uh.mission.v0" in detail["raw"]


@pytest.mark.asyncio
async def test_path_traversal_rejected(client: httpx.AsyncClient, isolated_project: Path) -> None:
    # Probes that DO reach the handler (Starlette doesn't normalize them out)
    # and must be rejected by ``_SAFE_ID_RE`` with HTTP 400 / ``invalid_id``:
    #
    #   * ``..foo``    — traversal-flavored prefix, leading dot fails the
    #                    ``^[A-Za-z0-9]`` head anchor.
    #   * ``foo!bar`` — ``!`` is outside ``[A-Za-z0-9._-]``.
    #   * ``foo bar`` — httpx percent-encodes the space, Starlette decodes
    #                    it back, regex rejects.
    for bad in ("..foo", "foo!bar", "foo bar"):
        resp = await client.get(f"/api/plugins/uh/missions/{bad}")
        assert resp.status_code == 400, (
            f"expected 400 for {bad!r}, got {resp.status_code}: {resp.text}"
        )
        payload = resp.json()
        assert payload["code"] == "invalid_id", payload

    # Bonus: keep the historical probes, but only assert the contract for
    # responses that actually reach the handler. ``..`` and ``with/slash``
    # are URL-normalized into different routes (200/404) before our handler
    # sees them — that's defense-in-depth handled by the router, not us.
    for bad in ("../etc", "..", "with/slash"):
        resp = await client.get(f"/api/plugins/uh/missions/{bad}")
        if resp.status_code == 400:
            assert resp.json()["code"] == "invalid_id"


@pytest.mark.asyncio
async def test_runs_list_empty_then_populated(client: httpx.AsyncClient, isolated_project: Path) -> None:
    empty = (await client.get("/api/plugins/uh/runs")).json()
    assert empty == {"runs": []}

    rr = isolated_project / ".harness" / "missions" / "demo" / "runtime-result.yaml"
    rr.write_text(
        yaml.safe_dump({
            "run_id": "20260519T120000Z-deadbeef",
            "mission_id": "demo",
            "status": "passed",
            "started_at": "2026-05-19T12:00:00Z",
            "finished_at": "2026-05-19T12:00:30Z",
            "duration_ms": 30000,
            "diff_paths": ["docs/demo.txt"],
        }),
        encoding="utf-8",
    )
    populated = (await client.get("/api/plugins/uh/runs?limit=5")).json()
    assert len(populated["runs"]) == 1
    row = populated["runs"][0]
    assert row["runId"] == "20260519T120000Z-deadbeef"
    assert row["status"] == "passed"
    assert row["durationMs"] == 30000


@pytest.mark.asyncio
async def test_create_and_run_mission_invokes_uh(client: httpx.AsyncClient, isolated_project: Path, fake_cli: Any) -> None:
    # Codex P1 round 4: empty overrides — happy path. The CLI is invoked
    # with the mission file PATH, not the id slug, and no overrides flag.
    resp = await client.post("/api/plugins/uh/missions/demo/run", json={})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "runId" in body
    spawn_calls = [c for c in fake_cli.calls if c.get("spawn")]
    assert spawn_calls, "expected spawn() to be called"
    args = spawn_calls[0]["args"]
    assert args[:2] == ["mission", "run"]
    assert args[2].endswith("/missions/demo/mission.yaml"), f"expected mission file path, got {args[2]}"
    assert "--runtime-config-overrides" not in args
    # Codex P1 round 13: --no-sandbox prevents the CLI from rerouting the
    # dashboard-triggered run into a bound sandbox worktree where artifact
    # persistence would skip the canonical mission directory.
    assert "--no-sandbox" in args
    # UH-82: the plugin must hand the CLI the same run id it tracked in
    # _active_runs so both sides write into runs/<run_id>/.
    assert "--run-id" in args, args
    assert args[args.index("--run-id") + 1] == body["runId"], args


@pytest.mark.asyncio
async def test_non_empty_overrides_threaded_to_cli(
    client: httpx.AsyncClient, isolated_project: Path, fake_cli: Any,
) -> None:
    """UH-81: the CLI now consumes ``--runtime-config-overrides <json>``, so
    the plugin must forward the operator-supplied overrides verbatim instead
    of 400-rejecting them. We assert the JSON-encoded payload lands as a
    single argv element next to the flag (no shell splitting)."""
    overrides = {"model": "claude-opus-4.6", "temperature": 0.2}
    resp = await client.post(
        "/api/plugins/uh/missions/demo/run",
        json={"runtime_config_overrides": overrides},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "runId" in body
    spawn_calls = [c for c in fake_cli.calls if c.get("spawn")]
    assert spawn_calls, "expected spawn() to be called"
    args = spawn_calls[0]["args"]
    assert "--runtime-config-overrides" in args, args
    idx = args.index("--runtime-config-overrides")
    assert idx + 1 < len(args), "overrides JSON must follow the flag"
    payload = args[idx + 1]
    # Compact JSON encoding — exact byte equality keeps the size cap honest.
    assert payload == json.dumps(overrides, separators=(",", ":"))
    # Round-trip parses back to the original dict.
    assert json.loads(payload) == overrides


@pytest.mark.asyncio
async def test_oversize_overrides_rejected(
    client: httpx.AsyncClient, isolated_project: Path, fake_cli: Any,
) -> None:
    """UH-81: the dashboard caps override JSON at 8 KiB (default) so an
    operator can't shove a megabyte of config into a CLI argv element. The
    cap is enforced before spawn so the CLI is never invoked on rejection."""
    # Build a payload whose compact JSON encoding exceeds the 8192-byte cap.
    # `len(json.dumps({"k0": "x"*N, ...}))` ~= sum of key+value sizes + JSON
    # overhead; we pad a single value past 8192 bytes for clarity.
    big_value = "x" * 9000
    resp = await client.post(
        "/api/plugins/uh/missions/demo/run",
        json={"runtime_config_overrides": {"blob": big_value}},
    )
    assert resp.status_code == 400, resp.text
    body = resp.json()
    assert body["code"] == "overrides_too_large"
    spawn_calls = [c for c in fake_cli.calls if c.get("spawn")]
    assert spawn_calls == [], "spawn must not be called on oversize rejection"


@pytest.mark.asyncio
async def test_non_finite_overrides_rejected_before_spawn(
    client: httpx.AsyncClient, isolated_project: Path, fake_cli: Any,
) -> None:
    """Codex P2 (PR #95): the dashboard MUST reject NaN/Infinity values in
    runtime_config_overrides up-front. Python's json.dumps emits them as
    bare ``NaN`` / ``Infinity`` tokens which Node's JSON.parse — used by the
    CLI's ``parseRuntimeConfigOverridesJson`` — rejects. Without strict
    serialization the dashboard would spawn a run that exits 1 immediately,
    turning a validation problem into a failed run."""
    # httpx (and most JSON libs) refuse to serialize NaN client-side, but a
    # caller using requests with allow_nan=True or hand-crafted JSON CAN send
    # `NaN` as a bare token. FastAPI's request.json() (orjson under the hood,
    # via _json_body in plugin_api) accepts it as a Python float('nan'). We
    # simulate that by posting a raw body with the bare token.
    resp = await client.post(
        "/api/plugins/uh/missions/demo/run",
        content=b'{"runtime_config_overrides": {"temperature": NaN}}',
        headers={"content-type": "application/json"},
    )
    assert resp.status_code == 400, resp.text
    body = resp.json()
    assert body["code"] == "invalid_overrides"
    assert "non-finite" in body["error"].lower(), body["error"]
    spawn_calls = [c for c in fake_cli.calls if c.get("spawn")]
    assert spawn_calls == [], "spawn must not be called on non-finite rejection"


@pytest.mark.asyncio
async def test_per_run_artifact_route_honors_run_id(
    client: httpx.AsyncClient, isolated_project: Path,
) -> None:
    """UH-82: per-run dirs land under runs/<run_id>/. The route must serve
    the requested run's file with is_run_scoped: true and the served
    run_id equal to the requested run_id."""
    runs_dir = isolated_project / ".harness" / "missions" / "demo" / "runs"
    (runs_dir / "run-A").mkdir(parents=True, exist_ok=True)
    (runs_dir / "run-B").mkdir(parents=True, exist_ok=True)
    (runs_dir / "run-A" / "prompt.md").write_text("A", encoding="utf-8")
    (runs_dir / "run-B" / "prompt.md").write_text("B", encoding="utf-8")

    resp_a = await client.get("/api/plugins/uh/missions/demo/runs/run-A/prompt")
    assert resp_a.status_code == 200, resp_a.text
    body_a = resp_a.json()
    assert body_a["kind"] == "text"
    assert body_a["content"] == "A"
    assert body_a["is_run_scoped"] is True
    assert body_a["requested_run_id"] == "run-A"
    assert body_a["served_run_id"] == "run-A"

    resp_b = await client.get("/api/plugins/uh/missions/demo/runs/run-B/prompt")
    assert resp_b.status_code == 200, resp_b.text
    body_b = resp_b.json()
    assert body_b["content"] == "B"
    assert body_b["served_run_id"] == "run-B"


@pytest.mark.asyncio
async def test_per_run_artifact_route_404_when_run_dir_missing(
    client: httpx.AsyncClient, isolated_project: Path,
) -> None:
    """UH-82: an unknown run_id returns 404 not_found, not a stale mirror."""
    resp = await client.get("/api/plugins/uh/missions/demo/runs/ghost-run/prompt")
    assert resp.status_code == 404, resp.text
    assert resp.json()["code"] == "not_found"


@pytest.mark.asyncio
async def test_sse_starts_after_historical_events(
    client: httpx.AsyncClient, isolated_project: Path, fake_cli: Any,
) -> None:
    """UH-82: per-run dirs put each run's events in its own file, so
    'historical events from another run' physically can't appear on a
    fresh run's stream. Still verify the new-run event surfaces."""
    fake_cli.popen_events = ['{"type":"runtime.started","run_id":"new-run"}']

    start = await client.post("/api/plugins/uh/missions/demo/run", json={})
    run_id = start.json()["runId"]
    assert fake_cli.last_popen is not None
    # Wire the FakePopen to the per-run events file the plugin watches.
    fake_cli.last_popen.events_path = (
        isolated_project / ".harness" / "missions" / "demo" / "runs" / run_id / "events.ndjson"
    )
    # Pre-seed a sibling mission-level events.ndjson; it MUST NOT leak.
    legacy = isolated_project / ".harness" / "missions" / "demo" / "events.ndjson"
    legacy.write_text('{"type":"runtime.started","run_id":"old-run"}\n', encoding="utf-8")
    fake_cli.last_popen.schedule_exit()

    async with client.stream("GET", f"/api/plugins/uh/runs/{run_id}/events") as resp:
        chunks: list[str] = []
        async for chunk in resp.aiter_text():
            chunks.append(chunk)
    body = "".join(chunks)
    # Legacy mission-level events MUST NOT appear in the new run's stream.
    assert "old-run" not in body, f"mission-level events leaked: {body!r}"
    # The new run's event MUST appear (the staged one appended on first poll).
    assert "new-run" in body, f"new run event missing: {body!r}"


@pytest.mark.asyncio
async def test_active_runs_evicted_after_terminal_state(
    client: httpx.AsyncClient, isolated_project: Path, fake_cli: Any, monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Codex P2 round 5: terminal-state runs must be evicted from
    _active_runs so the registry doesn't grow unbounded."""
    import plugin_api as _api  # type: ignore[import-not-found]
    monkeypatch.setattr(_api, "_RUN_EVICTION_GRACE_S", 0.05)
    monkeypatch.setattr(_api, "_RUN_TIMEOUT_S", 5.0)

    start = await client.post("/api/plugins/uh/missions/demo/run", json={})
    run_id = start.json()["runId"]
    assert fake_cli.last_popen is not None
    fake_cli.last_popen.schedule_exit()

    async with client.stream("GET", f"/api/plugins/uh/runs/{run_id}/events") as resp:
        async for _ in resp.aiter_bytes():
            pass
    # Eviction is scheduled after `done` is emitted; give the grace period
    # plus a small buffer to actually run the eviction task.
    await asyncio.sleep(0.2)
    assert run_id not in _api._active_runs, "run not evicted after terminal state"


@pytest.mark.asyncio
async def test_sse_does_not_overwrite_cancelled_status(
    client: httpx.AsyncClient, isolated_project: Path, fake_cli: Any,
) -> None:
    """Codex P2 round 6: when a run is cancelled while an SSE stream is
    open (or opened later), the drain loop must NOT overwrite
    info['status']='cancelled' with 'finished'/'timeout'."""
    import plugin_api as _api  # type: ignore[import-not-found]
    start = await client.post("/api/plugins/uh/missions/demo/run", json={})
    run_id = start.json()["runId"]
    assert fake_cli.last_popen is not None
    # Cancel first — sets status=cancelled and schedules eviction.
    cancel = await client.post(f"/api/plugins/uh/runs/{run_id}/cancel")
    assert cancel.status_code == 200
    assert _api._active_runs[run_id]["status"] == "cancelled"
    # The cancel-side terminate() called schedule_exit() on FakePopen so the
    # SSE drain loop will see the proc as exited on first poll.
    async with client.stream("GET", f"/api/plugins/uh/runs/{run_id}/events") as resp:
        async for _ in resp.aiter_bytes():
            pass
    # Status must STILL be 'cancelled' — the SSE drain must not have
    # downgraded the terminal state.
    assert _api._active_runs.get(run_id, {}).get("status") == "cancelled" or \
           run_id not in _api._active_runs, (
        "SSE drain overwrote cancelled status — see Codex round 6 P2"
    )


@pytest.mark.asyncio
async def test_recent_runs_runid_round_trips_through_safe_regex(
    client: httpx.AsyncClient, isolated_project: Path,
) -> None:
    """Codex P2 round 6: the runId fallback used for legacy rows (no
    explicit run_id) must round-trip through _SAFE_ID_RE so the UI can
    deep-link to per-run routes without a 400 invalid_id."""
    import re
    from plugin_api import _SAFE_ID_RE  # type: ignore[import-not-found]
    # Seed a runtime-result.yaml without an explicit run_id but with a
    # started_at containing ':' (the worst-case fallback shape).
    rr_path = isolated_project / ".harness" / "missions" / "demo" / "runtime-result.yaml"
    rr_path.parent.mkdir(parents=True, exist_ok=True)
    rr_path.write_text(
        "schema_version: uh.runtime-result.v0\n"
        "mission_id: demo\n"
        "started_at: '2026-05-19T12:00:00Z'\n"
        "status: passed\n",
        encoding="utf-8",
    )
    resp = await client.get("/api/plugins/uh/runs?limit=5")
    runs = resp.json()["runs"]
    assert runs, "expected at least one run row"
    for row in runs:
        assert _SAFE_ID_RE.match(row["runId"]), (
            f"runId {row['runId']!r} does not match _SAFE_ID_RE; "
            "UI deep-link to /runs/{run_id}/... will 400"
        )


@pytest.mark.asyncio
async def test_cancelled_runtime_status_treated_as_terminal(
    client: httpx.AsyncClient, isolated_project: Path,
) -> None:
    """Codex P1 round 7: a runtime_result with status='cancelled' must
    surface as a terminal status (cancelled), NOT fall through to
    'running'."""
    rr_path = isolated_project / ".harness" / "missions" / "demo" / "runtime-result.yaml"
    rr_path.parent.mkdir(parents=True, exist_ok=True)
    rr_path.write_text(
        "schema_version: uh.runtime-result.v0\n"
        "mission_id: demo\n"
        "status: cancelled\n"
        "started_at: '2026-05-19T12:00:00Z'\n",
        encoding="utf-8",
    )
    resp = await client.get("/api/plugins/uh/missions")
    body = resp.json()
    demo = next((m for m in body["missions"] if m["id"] == "demo"), None)
    assert demo is not None
    assert demo["status"] == "cancelled", (
        f"expected cancelled, got {demo['status']!r}"
    )


@pytest.mark.asyncio
async def test_byte_offset_captured_before_spawn(
    client: httpx.AsyncClient, isolated_project: Path, fake_cli: Any, monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Codex P1 round 8: the events.ndjson offset MUST be captured BEFORE
    spawn() so events appended by the freshly-spawned child are still
    visible to the SSE tail (not skipped past). UH-82 widened the path
    to runs/<run_id>/events.ndjson; the offset is computed there."""
    import plugin_api as _api  # type: ignore[import-not-found]
    # Force a deterministic run id so we can target the per-run dir.
    monkeypatch.setattr(_api, "_make_run_id", lambda: "test-offset-run")
    events_path = isolated_project / ".harness" / "missions" / "demo" / "runs" / "test-offset-run" / "events.ndjson"
    events_path.parent.mkdir(parents=True, exist_ok=True)
    # Pre-seed bytes in the per-run dir to simulate a fast CLI that wrote
    # the file between stat() and spawn().
    events_path.write_text(
        '{"type":"hist","run_id":"old"}\n',
        encoding="utf-8",
    )
    historical_size = events_path.stat().st_size

    real_spawn = fake_cli.spawn

    def hooked_spawn(args: list[str], cwd: Path) -> Any:
        with events_path.open("a", encoding="utf-8") as fh:
            fh.write('{"type":"runtime.started","run_id":"x"}\n')
        return real_spawn(args, cwd)

    monkeypatch.setattr(fake_cli, "spawn", hooked_spawn)

    start = await client.post("/api/plugins/uh/missions/demo/run", json={})
    run_id = start.json()["runId"]
    info = _api._active_runs[run_id]
    # Offset must be at the historical end (pre-spawn snapshot), NOT
    # past the runtime.started event the hooked_spawn appended.
    assert info["started_byte_offset"] == historical_size, (
        f"offset captured after spawn: {info['started_byte_offset']} != {historical_size}"
    )


@pytest.mark.asyncio
async def test_watchdog_evicts_natural_exit_without_sse(
    client: httpx.AsyncClient, isolated_project: Path, fake_cli: Any, monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Codex P1 round 8: when a run completes naturally and no SSE
    consumer ever attaches, the watchdog must still evict from
    _active_runs and update status — otherwise it leaks forever."""
    import plugin_api as _api  # type: ignore[import-not-found]
    monkeypatch.setattr(_api, "_RUN_TIMEOUT_S", 0.3)
    monkeypatch.setattr(_api, "_RUN_EVICTION_GRACE_S", 0.05)

    start = await client.post("/api/plugins/uh/missions/demo/run", json={})
    run_id = start.json()["runId"]
    assert fake_cli.last_popen is not None
    # Simulate natural exit before the watchdog fires.
    fake_cli.last_popen.schedule_exit()

    # Wait past the timeout + eviction grace so the watchdog runs and
    # evicts. NO SSE consumer is attached during this test.
    await asyncio.sleep(0.5)
    assert run_id not in _api._active_runs, (
        "watchdog must evict naturally-completed runs without an SSE consumer"
    )

@pytest.mark.asyncio
async def test_mission_detail_last_run_includes_runId(
    client: httpx.AsyncClient, isolated_project: Path,
) -> None:
    """Codex P2 round 11: GET /missions/{id}.last_run MUST include
    runId (not just runtime) so consumers can deep-link to the run."""
    rr_path = isolated_project / ".harness" / "missions" / "demo" / "runtime-result.yaml"
    rr_path.parent.mkdir(parents=True, exist_ok=True)
    rr_path.write_text(
        "schema_version: uh.runtime-result.v0\n"
        "mission_id: demo\n"
        "run_id: 20260519T120000Z-deadbeef\n"
        "runtime: hermes\n"
        "status: passed\n"
        "started_at: '2026-05-19T12:00:00Z'\n",
        encoding="utf-8",
    )
    resp = await client.get("/api/plugins/uh/missions/demo")
    assert resp.status_code == 200
    body = resp.json()
    assert body["last_run"]["runId"] == "20260519T120000Z-deadbeef"
    assert body["last_run"]["runtime"] == "hermes"


@pytest.mark.asyncio
async def test_get_mission_surfaces_runs_index(
    client: httpx.AsyncClient, isolated_project: Path,
) -> None:
    """UH-82: GET /missions/{id} surfaces the per-run history from
    runs/index.json (newest-first, capped at 50) so the frontend can
    render a run picker without scanning the filesystem itself."""
    runs_dir = isolated_project / ".harness" / "missions" / "demo" / "runs"
    runs_dir.mkdir(parents=True, exist_ok=True)
    (runs_dir / "index.json").write_text(
        json.dumps({
            "schema_version": "uh.runs-index.v0",
            "runs": [
                {
                    "run_id": "run-1",
                    "started_at": "2026-05-20T12:00:00Z",
                    "finished_at": "2026-05-20T12:00:30Z",
                    "status": "passed",
                    "runtime": "hermes",
                },
                {
                    "run_id": "run-2",
                    "started_at": "2026-05-20T12:05:00Z",
                    "finished_at": "2026-05-20T12:05:30Z",
                    "status": "failed",
                    "runtime": "codex",
                },
                {
                    "run_id": "run-3",
                    "started_at": "2026-05-20T12:10:00Z",
                    "status": "running",
                    "runtime": "hermes",
                },
            ],
        }),
        encoding="utf-8",
    )
    # Also seed a latest.json pointer so last_run_id is surfaced.
    (isolated_project / ".harness" / "missions" / "demo" / "latest.json").write_text(
        json.dumps({
            "schema_version": "uh.latest-run.v0",
            "run_id": "run-3",
            "started_at": "2026-05-20T12:10:00Z",
            "status": "running",
        }),
        encoding="utf-8",
    )
    resp = await client.get("/api/plugins/uh/missions/demo")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["last_run_id"] == "run-3"
    runs = body["runs"]
    assert [r["run_id"] for r in runs] == ["run-3", "run-2", "run-1"]
    assert runs[0]["status"] == "running"
    assert runs[0]["runtime"] == "hermes"
    assert runs[1]["status"] == "failed"
    assert runs[2]["finished_at"] == "2026-05-20T12:00:30Z"


@pytest.mark.asyncio
async def test_workflows_list_to_detail_roundtrip_via_slug(
    client: httpx.AsyncClient, isolated_project: Path,
) -> None:
    """Codex P2 round 11: every workflow returned by /workflows MUST be
    fetchable by its returned `name` field via /workflows/{name}. Previously
    `name` was the YAML display string (e.g. 'Research & Documentation')
    which could not round-trip."""
    listing = (await client.get("/api/plugins/uh/workflows")).json()
    for w in listing["workflows"]:
        detail = await client.get(f"/api/plugins/uh/workflows/{w['name']}")
        assert detail.status_code == 200, (
            f"workflow name {w['name']!r} from /workflows did not resolve via /workflows/{{name}}: "
            f"{detail.status_code} {detail.text}"
        )


@pytest.mark.asyncio
async def test_concurrent_runs_for_same_mission_accepted(
    client: httpx.AsyncClient, isolated_project: Path, fake_cli: Any,
) -> None:
    """UH-82: per-run artifact directories eliminate the interleave hazard
    that motivated the previous 409 `run_already_active` guard. Two
    concurrent runs for the same mission now both succeed with distinct
    run ids."""
    first = await client.post("/api/plugins/uh/missions/demo/run", json={})
    assert first.status_code == 200, first.text
    second = await client.post("/api/plugins/uh/missions/demo/run", json={})
    assert second.status_code == 200, second.text
    assert first.json()["runId"] != second.json()["runId"]


@pytest.mark.asyncio
async def test_artifact_endpoint_rejects_symlinked_artifact(
    client: httpx.AsyncClient, isolated_project: Path,
) -> None:
    """Codex P2 round 13: a symlinked artifact (e.g. prompt.md ->
    /etc/passwd) must NOT be readable through the dashboard. Plugin must
    reject symlinks AND assert the resolved target is inside the mission
    directory."""
    mission_dir = isolated_project / ".harness" / "missions" / "demo"
    mission_dir.mkdir(parents=True, exist_ok=True)
    target = isolated_project / "secret.txt"
    target.write_text("SECRET", encoding="utf-8")
    (mission_dir / "prompt.md").symlink_to(target)
    resp = await client.get("/api/plugins/uh/missions/demo/prompt")
    assert resp.status_code == 400, resp.text
    body = resp.json()
    assert body["code"] in {"symlink_artifact", "path_escape"}
    # Sanity: secret must NOT have leaked.
    assert "SECRET" not in resp.text


@pytest.mark.asyncio
async def test_runid_fallback_strips_all_unsafe_chars(
    client: httpx.AsyncClient, isolated_project: Path,
) -> None:
    """Codex P2 round 12: ISO timestamps with `+00:00` offsets must
    produce a runId that round-trips through _SAFE_ID_RE. The previous
    fallback only replaced `:`, leaving `+` chars that broke deep-links."""
    from plugin_api import _SAFE_ID_RE  # type: ignore[import-not-found]
    rr_path = isolated_project / ".harness" / "missions" / "demo" / "runtime-result.yaml"
    rr_path.parent.mkdir(parents=True, exist_ok=True)
    rr_path.write_text(
        "schema_version: uh.runtime-result.v0\n"
        "mission_id: demo\n"
        "started_at: '2026-05-19T12:00:00+00:00'\n"
        "status: passed\n",
        encoding="utf-8",
    )
    resp = await client.get("/api/plugins/uh/runs?limit=5")
    runs = resp.json()["runs"]
    assert runs, "expected at least one run row"
    for row in runs:
        assert _SAFE_ID_RE.match(row["runId"]), (
            f"runId {row['runId']!r} does not match _SAFE_ID_RE — would 400 on deep-link"
        )


@pytest.mark.asyncio
async def test_cancel_does_not_misreport_natural_exit_as_cancelled(
    client: httpx.AsyncClient, isolated_project: Path, fake_cli: Any, monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Codex P2 round 10: if the child exits naturally between poll() and
    terminate() in cancel_run, the status MUST NOT be set to 'cancelled' —
    that would misreport a normal completion as cancelled."""
    import plugin_api as _api  # type: ignore[import-not-found]
    start = await client.post("/api/plugins/uh/missions/demo/run", json={})
    run_id = start.json()["runId"]
    assert fake_cli.last_popen is not None
    fake_popen = fake_cli.last_popen
    # Monkeypatch terminate to raise ProcessLookupError — simulating the
    # race where the child exited between the cancel handler's poll() and
    # its terminate() call.
    def terminate_already_gone() -> None:
        raise ProcessLookupError(3, "No such process")
    monkeypatch.setattr(fake_popen, "terminate", terminate_already_gone)
    resp = await client.post(f"/api/plugins/uh/runs/{run_id}/cancel")
    assert resp.status_code == 200
    body = resp.json()
    # Status must be 'finished' (natural exit), NOT 'cancelled'.
    assert body["status"] == "finished", (
        f"natural exit misreported as cancelled: {body}"
    )


@pytest.mark.asyncio
async def test_run_unknown_mission_returns_404(client: httpx.AsyncClient, isolated_project: Path) -> None:
    resp = await client.post("/api/plugins/uh/missions/ghost/run", json={})
    assert resp.status_code == 404
    assert resp.json()["code"] == "not_found"


@pytest.mark.asyncio
async def test_workflows_list_and_detail(client: httpx.AsyncClient, isolated_project: Path) -> None:
    listing = (await client.get("/api/plugins/uh/workflows")).json()
    # Codex P2 round 11: `name` is the file slug (used by /workflows/{name})
    # and `displayName` is the YAML display name. Locking both in.
    assert [w["name"] for w in listing["workflows"]] == ["research-docs"]
    assert [w["displayName"] for w in listing["workflows"]] == ["Research & Documentation"]
    detail = (await client.get("/api/plugins/uh/workflows/research-docs")).json()
    assert detail["phases"] == 1
    assert detail["phases_list"][0]["name"] == "research"
    assert "schema_version: uh.workflow.v0" in detail["raw"]


@pytest.mark.asyncio
async def test_workflow_update_rejects_invalid_yaml(client: httpx.AsyncClient, isolated_project: Path) -> None:
    bad = await client.put("/api/plugins/uh/workflows/research-docs", json={"raw": ":\n: bad"})
    assert bad.status_code == 400
    assert bad.json()["code"] in {"yaml_parse", "schema"}


@pytest.mark.asyncio
async def test_workflow_update_writes_file(client: httpx.AsyncClient, isolated_project: Path) -> None:
    new_yaml = yaml.safe_dump({
        "schema_version": "uh.workflow.v0",
        "id": "research-docs",
        "name": "Research v2",
        "phases": [{"name": "draft", "agent_role": "writer", "description": "Write"}],
    })
    resp = await client.put("/api/plugins/uh/workflows/research-docs", json={"raw": new_yaml})
    assert resp.status_code == 200, resp.text
    on_disk = (isolated_project / ".harness" / "workflows" / "research-docs.yaml").read_text()
    assert "Research v2" in on_disk


@pytest.mark.asyncio
async def test_verification_missing_then_present(client: httpx.AsyncClient, isolated_project: Path) -> None:
    missing = await client.get("/api/plugins/uh/missions/demo/verification")
    assert missing.status_code == 404
    assert missing.json()["code"] == "not_found"

    verif = isolated_project / ".harness" / "missions" / "demo" / "verification.yaml"
    verif.write_text(
        yaml.safe_dump({
            "status": "passed",
            "checks_passed": 1,
            "checks_failed": 0,
            "checks_blocked": 0,
            "acceptance_criteria": [{"id": "ac-1", "description": "did", "status": "passed"}],
            "runtime_config": {"hermes": {"model": "x"}},
        }),
        encoding="utf-8",
    )
    payload = (await client.get("/api/plugins/uh/missions/demo/verification")).json()
    assert payload["status"] == "passed"
    assert payload["acceptance"][0]["id"] == "ac-1"
    assert payload["runtime_config"]["hermes"]["model"] == "x"


@pytest.mark.asyncio
async def test_create_mission_wizard_validates_fields(client: httpx.AsyncClient, isolated_project: Path) -> None:
    resp = await client.post("/api/plugins/uh/missions", json={"id": "bad/id", "name": "X", "workflow_profile": "y"})
    assert resp.status_code == 400
    body = resp.json()
    assert body["code"] == "invalid_id"
    assert "id" in body.get("fields", {})


@pytest.mark.asyncio
async def test_create_mission_wizard_writes_yaml(client: httpx.AsyncClient, isolated_project: Path) -> None:
    payload = {
        "id": "new-mission",
        "name": "New Mission",
        "workflow_profile": "research-docs",
        "objective": "Try a thing",
        "acceptance_criteria": [{"id": "ac-1", "description": "thing", "severity": "warn"}],
    }
    resp = await client.post("/api/plugins/uh/missions", json=payload)
    assert resp.status_code == 200, resp.text
    on_disk = (isolated_project / ".harness" / "missions" / "new-mission" / "mission.yaml").read_text()
    assert "new-mission" in on_disk
    assert "Try a thing" in on_disk
    # Re-creating should 409.
    dup = await client.post("/api/plugins/uh/missions", json=payload)
    assert dup.status_code == 409
    assert dup.json()["code"] == "exists"


@pytest.mark.asyncio
async def test_artifact_endpoints_missing_kind(client: httpx.AsyncClient, isolated_project: Path) -> None:
    # When the file isn't there, we return {kind: "missing"} rather than 404
    # so the UI doesn't have to special-case missing-artifact rendering.
    payload = (await client.get("/api/plugins/uh/missions/demo/prompt")).json()
    assert payload["kind"] == "missing"

    (isolated_project / ".harness" / "missions" / "demo" / "prompt.md").write_text("hello", encoding="utf-8")
    payload = (await client.get("/api/plugins/uh/missions/demo/prompt")).json()
    assert payload == {"kind": "text", "content": "hello"}


@pytest.mark.asyncio
async def test_artifact_too_large_returns_413(client: httpx.AsyncClient, isolated_project: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("plugin_api._MAX_ARTIFACT_BYTES", 16)
    (isolated_project / ".harness" / "missions" / "demo" / "diff.patch").write_text("x" * 32, encoding="utf-8")
    resp = await client.get("/api/plugins/uh/missions/demo/diff")
    assert resp.status_code == 413
    assert resp.json()["code"] == "too_large"


@pytest.mark.asyncio
async def test_sse_emits_events_appended_mid_stream(client: httpx.AsyncClient, isolated_project: Path, fake_cli: Any) -> None:
    """Start a run, then have the fake CLI append two events; SSE must surface both."""
    # UH-82: FakePopen now derives the per-run events path from --run-id
    # in spawn argv (see conftest._derive_per_run_events_path).
    fake_cli.popen_events = [
        json.dumps({"type": "runtime.started"}),
        json.dumps({"type": "runtime.finished", "status": "passed"}),
    ]
    start = await client.post("/api/plugins/uh/missions/demo/run", json={})
    run_id = start.json()["runId"]

    # Drive the FakePopen to exit on second poll so the SSE generator returns.
    fake_cli.last_popen.schedule_exit()

    async with client.stream("GET", f"/api/plugins/uh/runs/{run_id}/events") as stream:
        chunks: list[str] = []
        async for chunk in stream.aiter_text():
            chunks.append(chunk)
            if "event: done" in "".join(chunks):
                break
    body = "".join(chunks)
    assert "runtime.started" in body
    assert "runtime.finished" in body
    assert "event: done" in body


@pytest.mark.asyncio
async def test_cancel_run_terminates_process(client: httpx.AsyncClient, isolated_project: Path, fake_cli: Any) -> None:
    start = await client.post("/api/plugins/uh/missions/demo/run", json={})
    run_id = start.json()["runId"]
    cancel = await client.post(f"/api/plugins/uh/runs/{run_id}/cancel")
    assert cancel.status_code == 200
    assert fake_cli.last_popen.terminated is True


@pytest.mark.asyncio
async def test_cancel_unknown_run_404(client: httpx.AsyncClient, isolated_project: Path) -> None:
    resp = await client.post("/api/plugins/uh/runs/unknown-run/cancel")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_error_handler_returns_uniform_shape(client: httpx.AsyncClient, isolated_project: Path) -> None:
    # Trigger a 400 via an invalid wizard payload.
    resp = await client.post("/api/plugins/uh/missions", json={"id": "", "name": "x", "workflow_profile": "y"})
    assert resp.status_code == 400
    body = resp.json()
    assert "error" in body and "code" in body


@pytest.mark.asyncio
async def test_run_timeout_terminates_and_emits_timeout_event(
    client: httpx.AsyncClient,
    isolated_project: Path,
    fake_cli: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A run exceeding ``UH_RUN_TIMEOUT_S`` is SIGTERMed by the SSE
    drain loop; the stream surfaces ``event: timeout`` before ``event: done``.

    Closes the gap where the timeout knob was documented but not enforced
    (PR #89 finding #2).
    """
    monkeypatch.setattr("plugin_api._RUN_TIMEOUT_S", 0.5)
    # Stage one event so the SSE generator's initial "wait for the file"
    # loop returns quickly. We deliberately do NOT call ``schedule_exit``
    # — the FakePopen stays in the running state so the timeout branch
    # is the only termination path.
    fake_cli.popen_events = [json.dumps({"type": "runtime.started"})]

    start = await client.post("/api/plugins/uh/missions/demo/run", json={})
    run_id = start.json()["runId"]

    async with client.stream("GET", f"/api/plugins/uh/runs/{run_id}/events") as stream:
        chunks: list[str] = []
        async for chunk in stream.aiter_text():
            chunks.append(chunk)
            if "event: done" in "".join(chunks):
                break
    body = "".join(chunks)
    assert "runtime.started" in body, body
    assert "event: timeout" in body, body
    assert "event: done" in body, body
    assert body.index("event: timeout") < body.index("event: done")
    assert fake_cli.last_popen.terminated is True


@pytest.mark.asyncio
async def test_start_run_timeout_terminates_even_without_sse(
    client: httpx.AsyncClient,
    isolated_project: Path,
    fake_cli: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Watchdog SIGTERMs a hung child even when nobody opens the SSE stream.

    Pre-fix, the timeout only fired inside the SSE drain loop; an operator
    who started a run and never opened the live tail (or whose tab crashed)
    saw the run hang in ``running`` forever. The watchdog is spawned by
    ``start_run`` and is independent of any reader (PR #89 finding #1).
    """
    monkeypatch.setattr("plugin_api._RUN_TIMEOUT_S", 0.4)
    fake_cli.popen_events = []  # nothing staged — proc just hangs

    start = await client.post("/api/plugins/uh/missions/demo/run", json={})
    assert start.status_code == 200, start.text
    run_id = start.json()["runId"]

    # Do NOT open the SSE stream. Sleep past the timeout deadline and let
    # the watchdog do its job.
    await asyncio.sleep(0.7)

    assert fake_cli.last_popen.terminated is True
    import plugin_api as _api
    assert _api._active_runs[run_id]["status"] == "timeout"
    # UH-82: the watchdog persists the timeout event to the per-run
    # events.ndjson so a fresh SSE reader catching up sees it.
    events_path = (
        isolated_project / ".harness" / "missions" / "demo" / "runs" / run_id / "events.ndjson"
    )
    on_disk = events_path.read_text(encoding="utf-8")
    assert "runtime.timeout" in on_disk, on_disk


async def test_uh_cli_runner_spawn_uses_devnull(monkeypatch: pytest.MonkeyPatch) -> None:
    """``_UhCliRunner.spawn`` must NOT attach PIPEs to the child's stdio.

    Without a reader, full pipe buffers deadlock the child (PR #89 finding
    #1, second sub-finding). Events flow via the on-disk ``events.ndjson``
    file the CLI writes; stdout/stderr are noise that goes to ``/dev/null``.
    """
    import subprocess as _sp
    import plugin_api as _api

    captured: dict[str, Any] = {}

    class _FakePopen:
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            captured["args"] = args
            captured["kwargs"] = kwargs

    monkeypatch.setattr(_api.subprocess, "Popen", _FakePopen)
    _api._UhCliRunner().spawn(["mission", "run", "demo"], Path("/tmp"))

    assert captured["kwargs"]["stdout"] is _sp.DEVNULL
    assert captured["kwargs"]["stderr"] is _sp.DEVNULL
    assert "stdin" not in captured["kwargs"] or captured["kwargs"]["stdin"] is not _sp.PIPE


@pytest.mark.asyncio
async def test_get_mission_handles_malformed_yaml(
    client: httpx.AsyncClient, isolated_project: Path,
) -> None:
    """Malformed ``mission.yaml`` returns the structured ``malformed_yaml``
    400 instead of an unhandled YAMLError bubbling up as a generic 500
    (PR #89 finding #6)."""
    mission_yaml = isolated_project / ".harness" / "missions" / "demo" / "mission.yaml"
    mission_yaml.write_text(":\n:::bad:::\n  - [unbalanced", encoding="utf-8")

    resp = await client.get("/api/plugins/uh/missions/demo")
    assert resp.status_code == 400, resp.text
    body = resp.json()
    assert body["code"] == "malformed_yaml"
    assert body["error"]
    assert "details" in body


@pytest.mark.asyncio
async def test_get_mission_tolerates_malformed_sibling(
    client: httpx.AsyncClient, isolated_project: Path,
) -> None:
    """Codex P2 round 9: a malformed mission.yaml in some OTHER mission
    directory must NOT break the drilldown for a valid mission. The
    previous implementation called _scan_missions(root) here which
    parses every mission and would 500 the valid mission's detail."""
    # Drop a corrupt mission alongside the valid 'demo' one.
    bad_dir = isolated_project / ".harness" / "missions" / "corrupt"
    bad_dir.mkdir(parents=True, exist_ok=True)
    (bad_dir / "mission.yaml").write_text(":\n:::bad:::\n  - [unbalanced", encoding="utf-8")
    # The valid mission's detail must still succeed.
    resp = await client.get("/api/plugins/uh/missions/demo")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["id"] == "demo"

@pytest.mark.asyncio
async def test_get_workflow_handles_malformed_yaml(
    client: httpx.AsyncClient, isolated_project: Path,
) -> None:
    """Codex P2 followup: malformed workflow yaml must surface as 400
    ``malformed_yaml`` instead of a generic 500."""
    wf_yaml = isolated_project / ".harness" / "workflows" / "research-docs.yaml"
    wf_yaml.write_text(":\n:::bad:::\n  - [unbalanced", encoding="utf-8")

    resp = await client.get("/api/plugins/uh/workflows/research-docs")
    assert resp.status_code == 400, resp.text
    body = resp.json()
    assert body["code"] == "malformed_yaml"
    assert body["error"]


@pytest.mark.asyncio
async def test_run_watchdog_cancelled_on_normal_sse_completion(
    client: httpx.AsyncClient, isolated_project: Path, fake_cli: Any, monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Codex P2 followup: when a run exits via the SSE drain loop, the
    timeout watchdog task MUST be cancelled — otherwise every finished
    run leaves a sleeping asyncio task until UH_RUN_TIMEOUT_S elapses."""
    import plugin_api as _api  # type: ignore[import-not-found]

    # Watchdog comfortably outlives the run so the SSE drain loop wins the
    # race. If the watchdog were not cancelled on normal exit, it would
    # still be sleeping after the SSE stream returns.
    monkeypatch.setattr(_api, "_RUN_TIMEOUT_S", 5.0)

    # Mark the spawned process as exited immediately after spawn so the SSE
    # drain loop hits the natural completion path before the watchdog runs.
    # FakePopen.schedule_exit() makes poll() return the returncode on next call.

    start = await client.post("/api/plugins/uh/missions/demo/run", json={})
    run_id = start.json()["runId"]
    assert fake_cli.last_popen is not None
    fake_cli.last_popen.schedule_exit()

    # Drain the SSE stream end-to-end so the normal completion path runs.
    async with client.stream("GET", f"/api/plugins/uh/runs/{run_id}/events") as resp:
        async for _ in resp.aiter_bytes():
            pass

    info = _api._active_runs.get(run_id)
    assert info is not None
    assert info["status"] == "finished"
    watchdog = info.get("watchdog")
    assert watchdog is not None
    # The watchdog task must be done (cancelled) — no leaked sleeping task.
    assert watchdog.done(), "watchdog task was not cancelled after normal SSE completion"
