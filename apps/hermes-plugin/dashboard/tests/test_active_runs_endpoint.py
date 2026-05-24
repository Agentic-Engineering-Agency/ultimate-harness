"""UH-97 backend coverage for GET /runs/active — missions with an in-flight
run (latest.json status == running)."""
from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest


def _write_latest(root: Path, mission_id: str, status: str, run_id: str = "r1") -> None:
    mission_dir = root / ".harness" / "missions" / mission_id
    mission_dir.mkdir(parents=True, exist_ok=True)
    (mission_dir / "latest.json").write_text(
        json.dumps({
            "schema_version": "uh.latest-run.v0",
            "run_id": run_id,
            "started_at": "2026-05-20T00:00:00.000Z",
            "status": status,
        }),
        encoding="utf-8",
    )


@pytest.mark.asyncio
async def test_no_active_runs(client: httpx.AsyncClient, isolated_project: Path) -> None:
    resp = await client.get("/api/plugins/uh/runs/active")
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"runs": []}


@pytest.mark.asyncio
async def test_one_active_run(client: httpx.AsyncClient, isolated_project: Path) -> None:
    _write_latest(isolated_project, "demo", "running", run_id="run-abc")
    resp = await client.get("/api/plugins/uh/runs/active")
    assert resp.status_code == 200, resp.text
    runs = resp.json()["runs"]
    assert len(runs) == 1
    assert runs[0]["missionId"] == "demo"
    assert runs[0]["runId"] == "run-abc"
    assert runs[0]["status"] == "running"


@pytest.mark.asyncio
async def test_only_running_returned(client: httpx.AsyncClient, isolated_project: Path) -> None:
    _write_latest(isolated_project, "demo", "running", run_id="live-1")
    _write_latest(isolated_project, "done-mission", "passed", run_id="old-1")
    resp = await client.get("/api/plugins/uh/runs/active")
    assert resp.status_code == 200, resp.text
    runs = resp.json()["runs"]
    assert [r["missionId"] for r in runs] == ["demo"]
