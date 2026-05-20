"""UH-87 backend coverage for the replay surface:

- `GET /missions/{id}/runs/{run_id}/overrides`
- `POST /missions/{id}/run` with `replay_of` in the body

The overrides endpoint reads `runs/<run_id>/runtime-session.yaml` and
surfaces the `runtime_config` block so the Run modal can pre-fill the
JSON textarea. start_run additionally pre-writes `replay_of` into
`runs/index.json` so the lineage survives even before the adapter
writes its first row.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import httpx
import pytest
import yaml


@pytest.mark.asyncio
async def test_overrides_returns_runtime_config_block(
    client: httpx.AsyncClient, isolated_project: Path,
) -> None:
    run_dir = isolated_project / ".harness" / "missions" / "demo" / "runs" / "run-a"
    run_dir.mkdir(parents=True)
    session = {
        "schema_version": "uh.runtime-session.v0",
        "mission_id": "demo",
        "runtime": "hermes",
        "status": "succeeded",
        "runtime_config": {
            "model": "claude-opus-4.6",
            "temperature": 0.2,
            "tools": ["web", "fs"],
        },
    }
    (run_dir / "runtime-session.yaml").write_text(
        yaml.safe_dump(session), encoding="utf-8",
    )
    resp = await client.get(
        "/api/plugins/uh/missions/demo/runs/run-a/overrides",
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["runtime_config_overrides"] == {
        "model": "claude-opus-4.6",
        "temperature": 0.2,
        "tools": ["web", "fs"],
    }


@pytest.mark.asyncio
async def test_overrides_missing_session_returns_empty(
    client: httpx.AsyncClient, isolated_project: Path,
) -> None:
    """The endpoint MUST NOT 404 when `runtime-session.yaml` is absent —
    operators can still replay starting from a clean overrides block."""
    run_dir = isolated_project / ".harness" / "missions" / "demo" / "runs" / "run-a"
    run_dir.mkdir(parents=True)
    # Deliberately no runtime-session.yaml on disk.
    resp = await client.get(
        "/api/plugins/uh/missions/demo/runs/run-a/overrides",
    )
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"runtime_config_overrides": {}}


@pytest.mark.asyncio
async def test_overrides_yaml_without_runtime_config_returns_empty(
    client: httpx.AsyncClient, isolated_project: Path,
) -> None:
    run_dir = isolated_project / ".harness" / "missions" / "demo" / "runs" / "run-a"
    run_dir.mkdir(parents=True)
    (run_dir / "runtime-session.yaml").write_text(
        yaml.safe_dump({
            "schema_version": "uh.runtime-session.v0",
            "mission_id": "demo",
            "runtime": "hermes",
            "status": "succeeded",
        }),
        encoding="utf-8",
    )
    resp = await client.get(
        "/api/plugins/uh/missions/demo/runs/run-a/overrides",
    )
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"runtime_config_overrides": {}}


@pytest.mark.asyncio
async def test_start_run_records_replay_of_in_index(
    client: httpx.AsyncClient, isolated_project: Path, fake_cli: Any,
) -> None:
    """POST `/missions/{id}/run` with `replay_of` must pre-write a
    `runs/index.json` row whose `replay_of` field carries the source run
    id. The TS adapter's `appendRunsIndexEntry` preserves this field on
    row replacement (see run-id.ts) so the breadcrumb survives the
    running -> terminal transition; for this test we only assert the
    Python-side write happened."""
    resp = await client.post(
        "/api/plugins/uh/missions/demo/run",
        json={"replay_of": "20260520T120000Z-deadbe"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    run_id = body["runId"]

    index_path = isolated_project / ".harness" / "missions" / "demo" / "runs" / "index.json"
    assert index_path.is_file(), "expected index.json to be pre-written"
    idx = json.loads(index_path.read_text(encoding="utf-8"))
    assert idx["schema_version"] == "uh.runs-index.v0"
    rows = [r for r in idx["runs"] if r["run_id"] == run_id]
    assert len(rows) == 1, idx
    assert rows[0]["replay_of"] == "20260520T120000Z-deadbe"
    assert rows[0]["status"] == "running"


@pytest.mark.asyncio
async def test_start_run_without_replay_of_does_not_write_index(
    client: httpx.AsyncClient, isolated_project: Path, fake_cli: Any,
) -> None:
    """Sanity: replay_of-less calls must NOT trigger the Python-side
    index write. The adapter still owns the running -> terminal row."""
    resp = await client.post("/api/plugins/uh/missions/demo/run", json={})
    assert resp.status_code == 200, resp.text
    index_path = isolated_project / ".harness" / "missions" / "demo" / "runs" / "index.json"
    assert not index_path.exists(), "Python side wrote index.json without replay_of"


@pytest.mark.asyncio
async def test_start_run_rejects_non_string_replay_of(
    client: httpx.AsyncClient, isolated_project: Path, fake_cli: Any,
) -> None:
    resp = await client.post(
        "/api/plugins/uh/missions/demo/run", json={"replay_of": 42},
    )
    assert resp.status_code == 400, resp.text
    assert resp.json()["code"] == "invalid_replay_of"


@pytest.mark.asyncio
async def test_start_run_rejects_unsafe_replay_of(
    client: httpx.AsyncClient, isolated_project: Path, fake_cli: Any,
) -> None:
    resp = await client.post(
        "/api/plugins/uh/missions/demo/run", json={"replay_of": "../etc/passwd"},
    )
    assert resp.status_code == 400, resp.text
    assert resp.json()["code"] == "invalid_id"