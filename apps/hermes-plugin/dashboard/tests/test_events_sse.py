"""UH-93 — disk-backed SSE for mission/run events.ndjson."""
from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any

import httpx
import pytest

_MISSION = "demo"


def _run_dir(root: Path, run_id: str) -> Path:
    return root / ".harness" / "missions" / _MISSION / "runs" / run_id


def _write_events(path: Path, lines: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "".join(json.dumps(line) + "\n" for line in lines),
        encoding="utf-8",
    )


def _append_event(path: Path, line: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(line) + "\n")


@pytest.mark.asyncio
async def test_cold_tail_emits_all_events_and_closes(
    client: httpx.AsyncClient, isolated_project: Path,
) -> None:
    run_id = "cold-run-001"
    events_path = _run_dir(isolated_project, run_id) / "events.ndjson"
    _write_events(
        events_path,
        [
            {"event": "runtime.started", "run_id": run_id},
            {"event": "runtime.finished", "run_id": run_id, "status": "passed"},
        ],
    )

    url = f"/api/plugins/uh/missions/{_MISSION}/runs/{run_id}/events?stream=1"
    async with client.stream("GET", url) as resp:
        assert resp.status_code == 200
        chunks: list[str] = []
        async for chunk in resp.aiter_text():
            chunks.append(chunk)
    body = "".join(chunks)
    assert "runtime.started" in body
    assert "runtime.finished" in body
    assert "event: done" in body


@pytest.mark.asyncio
async def test_hot_tail_receives_events_in_order(
    client: httpx.AsyncClient, isolated_project: Path,
) -> None:
    run_id = "hot-run-001"
    events_path = _run_dir(isolated_project, run_id) / "events.ndjson"
    events_path.parent.mkdir(parents=True, exist_ok=True)
    url = f"/api/plugins/uh/missions/{_MISSION}/runs/{run_id}/events?stream=1"

    async def _append_later() -> None:
        await asyncio.sleep(0.15)
        _append_event(events_path, {"event": "runtime.started", "seq": 1})
        await asyncio.sleep(0.15)
        _append_event(events_path, {"event": "codex.thread.started", "seq": 2})
        await asyncio.sleep(0.15)
        _append_event(events_path, {"event": "runtime.finished", "seq": 3, "status": "passed"})

    writer = asyncio.create_task(_append_later())
    try:
        async with client.stream("GET", url) as resp:
            chunks: list[str] = []
            async for chunk in resp.aiter_text():
                chunks.append(chunk)
                if "event: done" in "".join(chunks):
                    break
        body = "".join(chunks)
        assert body.index('"seq": 1') < body.index('"seq": 2') < body.index('"seq": 3')
    finally:
        await writer


@pytest.mark.asyncio
async def test_sse_keepalive_within_sixteen_seconds(
    isolated_project: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    import plugin_api as _api  # type: ignore[import-not-found]

    monkeypatch.setattr(_api, "_SSE_KEEPALIVE_S", 0.5)
    run_id = "heartbeat-run"
    events_path = _run_dir(isolated_project, run_id) / "events.ndjson"
    _write_events(events_path, [{"event": "runtime.started"}])

    async def _collect_until_keepalive() -> str:
        chunks: list[str] = []
        async for frame in _api._iter_run_events_sse(events_path, run_id=run_id):
            chunks.append(frame.decode("utf-8"))
            if ": keepalive" in "".join(chunks):
                return "".join(chunks)
        return "".join(chunks)

    body = await asyncio.wait_for(_collect_until_keepalive(), timeout=3.0)
    assert ": keepalive" in body


@pytest.mark.asyncio
async def test_disconnect_stops_server_generator(
    client: httpx.AsyncClient, isolated_project: Path,
) -> None:
    import plugin_api as _api  # type: ignore[import-not-found]

    run_id = "disconnect-run"
    events_path = _run_dir(isolated_project, run_id) / "events.ndjson"
    _write_events(events_path, [{"event": "runtime.started"}])
    url = f"/api/plugins/uh/missions/{_MISSION}/runs/{run_id}/events?stream=1"

    async with client.stream("GET", url) as resp:
        async for _ in resp.aiter_bytes():
            break
    await asyncio.sleep(0.3)
    assert _api._active_sse_tails == 0


@pytest.mark.asyncio
async def test_untracked_tail_survives_idle_gap_before_terminal(
    client: httpx.AsyncClient, isolated_project: Path,
) -> None:
    """Cold tail without a live proc must not close on short idle gaps (Codex P1)."""
    run_id = "idle-gap-run"
    events_path = _run_dir(isolated_project, run_id) / "events.ndjson"
    events_path.parent.mkdir(parents=True, exist_ok=True)
    url = f"/api/plugins/uh/missions/{_MISSION}/runs/{run_id}/events?stream=1"

    async def _append_with_gap() -> None:
        _append_event(events_path, {"event": "runtime.started", "seq": 1})
        await asyncio.sleep(0.75)
        _append_event(events_path, {"event": "runtime.finished", "seq": 2, "status": "passed"})

    writer = asyncio.create_task(_append_with_gap())
    try:
        async with client.stream("GET", url) as resp:
            chunks: list[str] = []
            async for chunk in resp.aiter_text():
                chunks.append(chunk)
                if "event: done" in "".join(chunks):
                    break
        body = "".join(chunks)
        assert "runtime.started" in body
        assert "runtime.finished" in body
        assert "event: done" in body
    finally:
        await writer


@pytest.mark.asyncio
async def test_historical_json_without_stream(
    client: httpx.AsyncClient, isolated_project: Path,
) -> None:
    run_id = "history-run"
    events_path = _run_dir(isolated_project, run_id) / "events.ndjson"
    _write_events(
        events_path,
        [{"event": "runtime.started"}, {"event": "runtime.finished", "status": "passed"}],
    )
    resp = await client.get(f"/api/plugins/uh/missions/{_MISSION}/runs/{run_id}/events")
    body = resp.json()
    assert body["mission_id"] == _MISSION
    assert len(body["events"]) == 2


@pytest.mark.asyncio
async def test_run_scoped_route_tails_cold_run(
    client: httpx.AsyncClient, isolated_project: Path,
) -> None:
    run_id = "legacy-cold-run"
    events_path = _run_dir(isolated_project, run_id) / "events.ndjson"
    _write_events(
        events_path,
        [{"event": "runtime.started"}, {"event": "runtime.finished", "status": "passed"}],
    )
    async with client.stream("GET", f"/api/plugins/uh/runs/{run_id}/events") as resp:
        chunks: list[str] = []
        async for chunk in resp.aiter_text():
            chunks.append(chunk)
    body = "".join(chunks)
    assert "runtime.finished" in body
    assert "event: done" in body
