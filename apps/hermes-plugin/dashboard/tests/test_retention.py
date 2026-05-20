"""UH-90 — run history retention policy.

Covers:
* `max_runs_per_mission: null`  → no prune on start_run.
* `max_runs_per_mission: 3` with 4 prior runs → oldest pruned + archived.
* Per-run artifact GET on an archived run → 404 / code `archived`.
* `max_runs_per_mission: 0`  → manifest loader treats as None with warning.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import httpx
import pytest

import plugin_api


pytestmark = pytest.mark.asyncio


def _seed_runs_index(root: Path, mission_id: str, run_ids: list[str]) -> Path:
    """Write a `runs/index.json` with `len(run_ids)` non-archived entries
    AND create each per-run directory containing a placeholder file. Older
    runs come first (oldest started_at). Returns the runs/ dir path."""
    runs_dir = root / ".harness" / "missions" / mission_id / "runs"
    runs_dir.mkdir(parents=True, exist_ok=True)
    entries: list[dict[str, Any]] = []
    for i, run_id in enumerate(run_ids):
        run_dir = runs_dir / run_id
        run_dir.mkdir(exist_ok=True)
        (run_dir / "prompt.md").write_text(f"prompt for {run_id}", encoding="utf-8")
        entries.append({
            "run_id": run_id,
            "started_at": f"2026-05-20T12:{i:02d}:00.000Z",
            "finished_at": f"2026-05-20T12:{i:02d}:30.000Z",
            "status": "passed",
            "runtime": "hermes",
        })
    (runs_dir / "index.json").write_text(
        json.dumps({"schema_version": "uh.runs-index.v0", "runs": entries}, indent=2),
        encoding="utf-8",
    )
    return runs_dir


@pytest.mark.asyncio
async def test_max_runs_null_no_prune_on_start_run(
    client: httpx.AsyncClient,
    isolated_project: Path,
    fake_cli: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Cap unset (None) → start_run MUST NOT touch existing runs/index.json
    or per-run dirs. We seed 6 runs, then trigger a new run; all 6 entries
    plus the new one must survive, none archived."""
    monkeypatch.setattr(plugin_api, "_MAX_RUNS_PER_MISSION", None)
    seeded = [f"run-{i:02d}" for i in range(6)]
    runs_dir = _seed_runs_index(isolated_project, "demo", seeded)

    resp = await client.post("/api/plugins/uh/missions/demo/run", json={})
    assert resp.status_code == 200, resp.text

    idx = json.loads((runs_dir / "index.json").read_text(encoding="utf-8"))
    # Index was never rewritten by the plugin — count stays at 6 (the new
    # run only gets an entry once the CLI itself appends one, which the
    # FakeUhCli doesn't simulate; we're testing the plugin side here).
    assert len(idx["runs"]) == 6
    for entry in idx["runs"]:
        assert "archived" not in entry or entry["archived"] is False
    for run_id in seeded:
        assert (runs_dir / run_id).is_dir(), f"{run_id} dir must survive"


@pytest.mark.asyncio
async def test_max_runs_3_with_4_existing_prunes_oldest(
    client: httpx.AsyncClient,
    isolated_project: Path,
    fake_cli: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Cap=3 with 4 prior runs → ONE oldest entry pruned. The plugin only
    prunes BEFORE spawning, so we expect: non-archived count drops to 3,
    the oldest run's directory is gone, and its index entry survives with
    archived=True (audit-trail invariant)."""
    monkeypatch.setattr(plugin_api, "_MAX_RUNS_PER_MISSION", 3)
    seeded = [f"run-{i:02d}" for i in range(4)]  # run-00 oldest, run-03 newest
    runs_dir = _seed_runs_index(isolated_project, "demo", seeded)

    resp = await client.post("/api/plugins/uh/missions/demo/run", json={})
    assert resp.status_code == 200, resp.text

    idx = json.loads((runs_dir / "index.json").read_text(encoding="utf-8"))
    by_id = {r["run_id"]: r for r in idx["runs"]}
    # The oldest (run-00) MUST be archived; the rest MUST NOT.
    assert by_id["run-00"].get("archived") is True
    for run_id in ("run-01", "run-02", "run-03"):
        assert by_id[run_id].get("archived") is not True, by_id[run_id]
    # Its per-run dir was removed; the other three still exist.
    assert not (runs_dir / "run-00").exists()
    for run_id in ("run-01", "run-02", "run-03"):
        assert (runs_dir / run_id).is_dir()
    # Non-archived count equals the cap.
    non_archived = [r for r in idx["runs"] if r.get("archived") is not True]
    assert len(non_archived) == 3


@pytest.mark.asyncio
async def test_get_run_artifact_on_archived_run_returns_404_with_archived_code(
    client: httpx.AsyncClient,
    isolated_project: Path,
) -> None:
    """Fetching `/missions/<id>/runs/<archived_run>/<kind>` MUST return
    404 with `code == "archived"` so the frontend can render a tailored
    placeholder instead of a generic not-found."""
    runs_dir = isolated_project / ".harness" / "missions" / "demo" / "runs"
    runs_dir.mkdir(parents=True, exist_ok=True)
    # Write an index with one archived entry, but DO NOT create its dir.
    (runs_dir / "index.json").write_text(
        json.dumps({
            "schema_version": "uh.runs-index.v0",
            "runs": [{
                "run_id": "archived-1",
                "started_at": "2026-05-20T11:00:00.000Z",
                "finished_at": "2026-05-20T11:00:30.000Z",
                "status": "passed",
                "runtime": "hermes",
                "archived": True,
            }],
        }, indent=2),
        encoding="utf-8",
    )

    resp = await client.get("/api/plugins/uh/missions/demo/runs/archived-1/prompt")
    assert resp.status_code == 404, resp.text
    payload = resp.json()
    assert payload["code"] == "archived", payload

    # And a genuinely-unknown run id still returns code=not_found so the
    # two cases stay distinguishable.
    resp2 = await client.get("/api/plugins/uh/missions/demo/runs/never-existed/prompt")
    assert resp2.status_code == 404, resp2.text
    assert resp2.json()["code"] == "not_found"


@pytest.mark.filterwarnings("ignore::pytest.PytestWarning")
def test_manifest_max_runs_zero_treated_as_null_with_warning(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Misconfigured manifest (`max_runs_per_mission: 0`) MUST NOT silently
    wipe history. The loader returns None (unlimited) and logs a warning
    with the rejected value so operators see the misconfig in dashboard logs."""
    # Point the loader at a synthetic manifest with cap=0.
    fake_manifest = tmp_path / "manifest.json"
    fake_manifest.write_text(json.dumps({
        "name": "uh",
        "config": {"max_runs_per_mission": 0},
    }), encoding="utf-8")
    # Patch __file__ so _load_max_runs_per_mission resolves to our fixture.
    monkeypatch.setattr(plugin_api, "__file__", str(tmp_path / "plugin_api.py"))

    with caplog.at_level(logging.WARNING, logger=plugin_api.__name__):
        result = plugin_api._load_max_runs_per_mission()

    assert result is None
    # Warning records the rejected value so operators can spot the misconfig.
    assert any(
        "max_runs_per_mission" in rec.getMessage() and "0" in rec.getMessage()
        for rec in caplog.records
    ), [rec.getMessage() for rec in caplog.records]