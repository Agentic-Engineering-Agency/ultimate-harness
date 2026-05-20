"""UH-89 backend coverage for `GET /missions/{id}/compare?a=&b=`.

Seeds two run directories under `isolated_project` with the artifacts the
compare endpoint reads (prompt.md, runtime-final.txt, diff.patch,
runtime-result.yaml, events.ndjson) and verifies:

- 200 happy path with both A and B payloads + parsed runtime-result.
- 404 when one of the run directories is missing.
- 400 when `a == b`.
- Events truncation kicks in at 501 lines -> `truncated_to: 500`.
"""
from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest
import yaml


def _seed_run(
    project_root: Path,
    mission_id: str,
    run_id: str,
    *,
    prompt: str = "hello world",
    final_message: str = "done",
    diff: str = "diff --git a/x b/x\n",
    runtime_result: dict | None = None,
    events: list[dict] | None = None,
) -> Path:
    run_dir = project_root / ".harness" / "missions" / mission_id / "runs" / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / "prompt.md").write_text(prompt, encoding="utf-8")
    (run_dir / "runtime-final.txt").write_text(final_message, encoding="utf-8")
    (run_dir / "diff.patch").write_text(diff, encoding="utf-8")
    if runtime_result is not None:
        (run_dir / "runtime-result.yaml").write_text(
            yaml.safe_dump(runtime_result), encoding="utf-8",
        )
    if events is not None:
        (run_dir / "events.ndjson").write_text(
            "\n".join(json.dumps(e) for e in events) + "\n",
            encoding="utf-8",
        )
    return run_dir


@pytest.mark.asyncio
async def test_compare_returns_both_sides(
    client: httpx.AsyncClient, isolated_project: Path,
) -> None:
    _seed_run(
        isolated_project, "demo", "run-a",
        prompt="prompt A",
        final_message="final A",
        diff="diff A",
        runtime_result={
            "schema_version": "uh.runtime-result.v0",
            "mission_id": "demo",
            "runtime": "hermes",
            "status": "passed",
        },
        events=[
            {"event": "runtime.started", "ts": "2026-05-20T12:00:00Z"},
            {"event": "runtime.finished", "ts": "2026-05-20T12:00:30Z"},
        ],
    )
    _seed_run(
        isolated_project, "demo", "run-b",
        prompt="prompt B",
        final_message="final B",
        diff="diff B",
        runtime_result={
            "schema_version": "uh.runtime-result.v0",
            "mission_id": "demo",
            "runtime": "hermes",
            "status": "failed",
        },
        events=[{"event": "runtime.started", "ts": "2026-05-20T13:00:00Z"}],
    )
    resp = await client.get(
        "/api/plugins/uh/missions/demo/compare", params={"a": "run-a", "b": "run-b"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["mission_id"] == "demo"
    assert body["a"]["run_id"] == "run-a"
    assert body["a"]["prompt"] == "prompt A"
    assert body["a"]["final_message"] == "final A"
    assert body["a"]["diff"] == "diff A"
    assert body["a"]["runtime_result"]["status"] == "passed"
    assert len(body["a"]["events"]) == 2
    assert body["a"]["events"][0]["event"] == "runtime.started"
    assert "truncated_to" not in body["a"]
    assert body["b"]["run_id"] == "run-b"
    assert body["b"]["runtime_result"]["status"] == "failed"
    assert len(body["b"]["events"]) == 1


@pytest.mark.asyncio
async def test_compare_missing_run_returns_404(
    client: httpx.AsyncClient, isolated_project: Path,
) -> None:
    _seed_run(isolated_project, "demo", "run-a")
    # run-b never seeded -> 404.
    resp = await client.get(
        "/api/plugins/uh/missions/demo/compare", params={"a": "run-a", "b": "run-b"},
    )
    assert resp.status_code == 404, resp.text
    body = resp.json()
    assert body["code"] == "not_found"
    assert "run-b" in body["error"]


@pytest.mark.asyncio
async def test_compare_same_run_returns_400(
    client: httpx.AsyncClient, isolated_project: Path,
) -> None:
    _seed_run(isolated_project, "demo", "run-a")
    resp = await client.get(
        "/api/plugins/uh/missions/demo/compare", params={"a": "run-a", "b": "run-a"},
    )
    assert resp.status_code == 400, resp.text
    body = resp.json()
    assert body["code"] == "same_run"


@pytest.mark.asyncio
async def test_compare_truncates_events_at_500(
    client: httpx.AsyncClient, isolated_project: Path,
) -> None:
    # 501 events on side A: must truncate to the most recent 500.
    events_a = [{"event": "tick", "i": i} for i in range(501)]
    _seed_run(isolated_project, "demo", "run-a", events=events_a)
    # Side B small: no truncation flag.
    _seed_run(isolated_project, "demo", "run-b", events=[{"event": "tick", "i": 0}])
    resp = await client.get(
        "/api/plugins/uh/missions/demo/compare", params={"a": "run-a", "b": "run-b"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["a"]["truncated_to"] == 500
    assert len(body["a"]["events"]) == 500
    # Most recent N kept: the FIRST kept event is i=1 (501 - 500).
    assert body["a"]["events"][0]["i"] == 1
    assert body["a"]["events"][-1]["i"] == 500
    assert "truncated_to" not in body["b"]
    assert len(body["b"]["events"]) == 1


@pytest.mark.asyncio
async def test_compare_handles_missing_artifacts_as_null(
    client: httpx.AsyncClient, isolated_project: Path,
) -> None:
    """A run with only some of the artifacts on disk surfaces `null`
    fields per-side rather than 500-ing the whole comparison."""
    run_a = isolated_project / ".harness" / "missions" / "demo" / "runs" / "run-a"
    run_b = isolated_project / ".harness" / "missions" / "demo" / "runs" / "run-b"
    run_a.mkdir(parents=True)
    run_b.mkdir(parents=True)
    # Only prompt on A, nothing on B.
    (run_a / "prompt.md").write_text("just A's prompt", encoding="utf-8")
    resp = await client.get(
        "/api/plugins/uh/missions/demo/compare", params={"a": "run-a", "b": "run-b"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["a"]["prompt"] == "just A's prompt"
    assert body["a"]["final_message"] is None
    assert body["a"]["diff"] is None
    assert body["a"]["runtime_result"] is None
    assert body["a"]["events"] == []
    assert body["b"]["prompt"] is None
    assert body["b"]["events"] == []