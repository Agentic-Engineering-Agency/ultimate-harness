"""UH-85 / UH-86 / UH-88 backend coverage for the runs[] surface of
`GET /missions/{id}`.

UH-82 already covers the populated newest-first case in
`tests/test_plugin_api.py::test_get_mission_surfaces_runs_index`. This
module pins down the corner cases the dashboard's RecentRunsPane depends
on:

- no `runs/index.json` -> `runs: []` (empty list, never missing key).
- `> 50` entries -> capped at 50, newest-first.
- malformed `runs/index.json` -> `runs: []` without raising.
"""
from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest


@pytest.mark.asyncio
async def test_runs_missing_index_returns_empty_list(
    client: httpx.AsyncClient, isolated_project: Path,
) -> None:
    """A mission with no `runs/` directory must still surface `runs: []`
    rather than omitting the key — RecentRunsPane reads `mission.runs`
    unconditionally and relies on the array shape."""
    resp = await client.get("/api/plugins/uh/missions/demo")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "runs" in body
    assert body["runs"] == []


@pytest.mark.asyncio
async def test_runs_index_capped_at_fifty_entries_newest_first(
    client: httpx.AsyncClient, isolated_project: Path,
) -> None:
    """The backend caps the response at 50 entries (newest-first). With
    60 entries on disk we must see the 50 newest (`run-59` … `run-10`)
    in descending order and not the 10 oldest."""
    runs_dir = isolated_project / ".harness" / "missions" / "demo" / "runs"
    runs_dir.mkdir(parents=True, exist_ok=True)
    entries = [
        {
            "run_id": f"run-{i:02d}",
            "started_at": f"2026-05-20T12:{i:02d}:00Z",
            "finished_at": f"2026-05-20T12:{i:02d}:30Z",
            "status": "passed",
            "runtime": "hermes",
        }
        for i in range(60)
    ]
    (runs_dir / "index.json").write_text(
        json.dumps({"schema_version": "uh.runs-index.v0", "runs": entries}),
        encoding="utf-8",
    )
    resp = await client.get("/api/plugins/uh/missions/demo")
    assert resp.status_code == 200, resp.text
    runs = resp.json()["runs"]
    assert len(runs) == 50
    # Newest first: run-59 ... run-10.
    assert runs[0]["run_id"] == "run-59"
    assert runs[-1]["run_id"] == "run-10"
    # Ordering is strictly descending by index of the on-disk append.
    assert [r["run_id"] for r in runs] == [f"run-{i:02d}" for i in range(59, 9, -1)]


@pytest.mark.asyncio
async def test_runs_malformed_index_does_not_crash(
    client: httpx.AsyncClient, isolated_project: Path,
) -> None:
    """Corrupt `runs/index.json` must degrade to `runs: []` and a 200,
    not propagate the JSON decode error to the dashboard."""
    runs_dir = isolated_project / ".harness" / "missions" / "demo" / "runs"
    runs_dir.mkdir(parents=True, exist_ok=True)
    (runs_dir / "index.json").write_text("{not json at all", encoding="utf-8")
    resp = await client.get("/api/plugins/uh/missions/demo")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["runs"] == []


@pytest.mark.asyncio
async def test_runs_index_with_non_dict_entries_skipped(
    client: httpx.AsyncClient, isolated_project: Path,
) -> None:
    """Non-dict entries inside `runs/index.json` must be silently dropped
    rather than included as `{}` placeholders."""
    runs_dir = isolated_project / ".harness" / "missions" / "demo" / "runs"
    runs_dir.mkdir(parents=True, exist_ok=True)
    (runs_dir / "index.json").write_text(
        json.dumps({
            "schema_version": "uh.runs-index.v0",
            "runs": [
                "not-a-dict",
                {"run_id": "ok-1", "started_at": "2026-05-20T12:00:00Z", "status": "passed"},
                None,
            ],
        }),
        encoding="utf-8",
    )
    resp = await client.get("/api/plugins/uh/missions/demo")
    assert resp.status_code == 200, resp.text
    runs = resp.json()["runs"]
    assert len(runs) == 1
    assert runs[0]["run_id"] == "ok-1"