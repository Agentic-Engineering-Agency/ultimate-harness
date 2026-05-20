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


@pytest.mark.asyncio
async def test_non_empty_overrides_rejected_until_cli_supports_them(
    client: httpx.AsyncClient, isolated_project: Path,
) -> None:
    """Codex P1 round 4: silently persisting overrides while running with
    defaults invalidates experiments. Reject non-empty overrides up-front
    until the CLI actually consumes them."""
    resp = await client.post(
        "/api/plugins/uh/missions/demo/run",
        json={"runtime_config_overrides": {"model": "claude-opus-4.6"}},
    )
    assert resp.status_code == 400, resp.text
    body = resp.json()
    assert body["code"] == "overrides_not_yet_supported"
    assert "runtime_config_overrides" in body.get("fields", {})


@pytest.mark.asyncio
async def test_per_run_artifact_marks_response_as_not_run_scoped(
    client: httpx.AsyncClient, isolated_project: Path,
) -> None:
    """Codex P1 round 4: until adapters write per-run subdirectories, the
    per-run artifact route serves mission-latest. The response must say so
    explicitly so callers don't misattribute evidence."""
    final_path = isolated_project / ".harness" / "missions" / "demo" / "runtime-final.txt"
    final_path.write_text("demo final message\n", encoding="utf-8")
    resp = await client.get(
        "/api/plugins/uh/missions/demo/runs/some-run-id/final-message"
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["is_run_scoped"] is False
    assert body["requested_run_id"] == "some-run-id"
    assert body["served_run_id"] == "mission-latest"
    assert "note" in body


@pytest.mark.asyncio
async def test_sse_starts_after_historical_events(
    client: httpx.AsyncClient, isolated_project: Path, fake_cli: Any,
) -> None:
    """Codex P1 round 5: pre-existing events from a previous run must NOT
    be replayed on the new run's SSE stream."""
    events_path = isolated_project / ".harness" / "missions" / "demo" / "events.ndjson"
    events_path.parent.mkdir(parents=True, exist_ok=True)
    # Pre-seed historical events from an earlier run.
    events_path.write_text(
        '{"type":"runtime.started","run_id":"old-run"}\n'
        '{"type":"runtime.finished","run_id":"old-run"}\n',
        encoding="utf-8",
    )
    fake_cli.popen_events_path = events_path
    fake_cli.popen_events = ['{"type":"runtime.started","run_id":"new-run"}']

    start = await client.post("/api/plugins/uh/missions/demo/run", json={})
    run_id = start.json()["runId"]
    assert fake_cli.last_popen is not None
    fake_cli.last_popen.schedule_exit()

    async with client.stream("GET", f"/api/plugins/uh/runs/{run_id}/events") as resp:
        chunks: list[str] = []
        async for chunk in resp.aiter_text():
            chunks.append(chunk)
    body = "".join(chunks)
    # Old run's events MUST NOT appear in the new run's stream.
    assert "old-run" not in body, f"historical events replayed: {body!r}"
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
async def test_run_unknown_mission_returns_404(client: httpx.AsyncClient, isolated_project: Path) -> None:
    resp = await client.post("/api/plugins/uh/missions/ghost/run", json={})
    assert resp.status_code == 404
    assert resp.json()["code"] == "not_found"


@pytest.mark.asyncio
async def test_workflows_list_and_detail(client: httpx.AsyncClient, isolated_project: Path) -> None:
    listing = (await client.get("/api/plugins/uh/workflows")).json()
    assert [w["name"] for w in listing["workflows"]] == ["Research & Documentation"]
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
    events_path = isolated_project / ".harness" / "missions" / "demo" / "events.ndjson"
    fake_cli.popen_events_path = events_path
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
    events_path = isolated_project / ".harness" / "missions" / "demo" / "events.ndjson"
    fake_cli.popen_events_path = events_path
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
    events_path = isolated_project / ".harness" / "missions" / "demo" / "events.ndjson"
    fake_cli.popen_events_path = events_path
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
    # The watchdog also persists the timeout to events.ndjson so a fresh
    # SSE reader catching up sees it.
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
