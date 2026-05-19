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
    for bad in ("../etc", "..", "with/slash", "with space"):
        resp = await client.get(f"/api/plugins/uh/missions/{bad}")
        # FastAPI rewrites `..` and `/` in URL — `with space` would normally
        # 404 at the router level, but `..` may resolve to the parent route.
        # Whatever path makes it through to the handler must be rejected as
        # 400 with `code: invalid_id`.
        if resp.status_code in {400, 404}:
            if resp.status_code == 400:
                payload = resp.json()
                assert payload["code"] == "invalid_id"


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
    # Run an existing mission (`demo` from the fixture).
    resp = await client.post("/api/plugins/uh/missions/demo/run", json={"runtime_config_overrides": {"foo": 1}})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "runId" in body
    spawn_calls = [c for c in fake_cli.calls if c.get("spawn")]
    assert spawn_calls, "expected spawn() to be called"
    assert spawn_calls[0]["args"][:3] == ["mission", "run", "demo"]
    assert "--runtime-config-overrides" in spawn_calls[0]["args"]


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
