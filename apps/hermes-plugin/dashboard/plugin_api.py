"""UH-62 — FastAPI bridge to the Ultimate Harness CLI.

This module is mounted by the Hermes dashboard at ``/api/plugins/uh/`` (see
``manifest.json``). It is the only Python entry point of the plugin; everything
else is either declarative (manifest, theme) or a TS bundle.

Design contract:

* Project root resolves from ``$UH_PROJECT_ROOT`` (default: ``os.getcwd()``).
  The dashboard runs in a long-lived process, so we re-read the env on every
  request rather than freezing it at import time.
* CLI calls (``uh status``, ``uh adapter check``, ``uh mission run``) go
  through :func:`_run_uh`; **all** subprocess invocations have timeouts —
  ``UH_READ_TIMEOUT_S`` (default 30s) for read commands, ``UH_RUN_TIMEOUT_S``
  (default 1h) for mission runs.
* When a ``--json`` flag isn't available yet (UH-78 hasn't shipped at runtime),
  we fall back to scanning ``.harness/`` directly. The scans use the same
  on-disk layout the harness writes (paths.ts + adapters/*.ts).
* Path params (``mission_id``, ``run_id``, ``workflow_name``) are validated
  against :data:`_SAFE_ID_RE` before being used in any filesystem path.
  Anything containing ``/``, ``..``, NUL, or non-``[A-Za-z0-9._-]`` characters
  is rejected with HTTP 400.
* All errors return :data:`_ERROR_JSON_SHAPE` so the TS side can render a
  uniform inline error: ``{"error", "code", "stderr"?, "fields"?}``.

Tests live in ``tests/test_plugin_api.py`` and inject a ``FakeUhCli`` instead
of running the real binary.
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import logging
import shutil
import tempfile
import subprocess
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, AsyncIterator, Optional

import yaml
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import JSONResponse, StreamingResponse


# ---------------------------------------------------------------------------
# Configuration knobs (env-driven so the dashboard can override per install).
# ---------------------------------------------------------------------------

_SAFE_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
_UH_BIN_ENV = "UH_CLI_BIN"
_UH_PROJECT_ROOT_ENV = "UH_PROJECT_ROOT"
_READ_TIMEOUT_S = float(os.environ.get("UH_READ_TIMEOUT_S", "30"))
_RUN_TIMEOUT_S = float(os.environ.get("UH_RUN_TIMEOUT_S", "3600"))
_SSE_KEEPALIVE_S = float(os.environ.get("UH_SSE_KEEPALIVE_S", "15"))
_MAX_ARTIFACT_BYTES = int(os.environ.get("UH_MAX_ARTIFACT_BYTES", str(5 * 1024 * 1024)))
_MAX_OVERRIDES_JSON_BYTES = int(os.environ.get("UH_MAX_OVERRIDES_JSON_BYTES", "8192"))

# UH-90 — retention. Cap is read once at module import from the plugin's
# `manifest.json` ("config.max_runs_per_mission"). `None` = unlimited (no
# prune). Non-positive values fall back to None with a logged warning so a
# misconfigured manifest doesn't accidentally wipe history. Tests rebind
# this at module scope, mirroring the `_RUN_TIMEOUT_S` pattern.
_logger = logging.getLogger(__name__)


def _load_max_runs_per_mission() -> Optional[int]:
    manifest_path = Path(__file__).resolve().parent / "manifest.json"
    try:
        with manifest_path.open("r", encoding="utf-8") as fh:
            manifest = json.load(fh)
    except (OSError, ValueError):
        return None
    config = manifest.get("config") if isinstance(manifest, dict) else None
    if not isinstance(config, dict):
        return None
    raw = config.get("max_runs_per_mission")
    if raw is None:
        return None
    if not isinstance(raw, int) or isinstance(raw, bool) or raw <= 0:
        _logger.warning(
            "UH-90: ignoring manifest max_runs_per_mission=%r (must be a "
            "positive integer); treating as unlimited.",
            raw,
        )
        return None
    return raw


_MAX_RUNS_PER_MISSION: Optional[int] = _load_max_runs_per_mission()

_ERROR_JSON_SHAPE = {"error", "code", "stderr"}


def _project_root() -> Path:
    """Resolve the harness project root for this request."""
    return Path(os.environ.get(_UH_PROJECT_ROOT_ENV, os.getcwd())).resolve()


def _uh_bin() -> str:
    return os.environ.get(_UH_BIN_ENV, "uh")


def _harness(root: Path) -> Path:
    return root / ".harness"


# ---------------------------------------------------------------------------
# Safety helpers.
# ---------------------------------------------------------------------------


def _safe_id(value: str, field: str) -> str:
    if not isinstance(value, str) or not _SAFE_ID_RE.match(value):
        raise HTTPException(status_code=400, detail={
            "error": f"invalid {field}",
            "code": "invalid_id",
        })
    return value


def _err(status: int, code: str, message: str, **extra: Any) -> HTTPException:
    payload = {"error": message, "code": code}
    payload.update(extra)
    return HTTPException(status_code=status, detail=payload)


# ---------------------------------------------------------------------------
# CLI shell-out (overridable for tests).
# ---------------------------------------------------------------------------


class _UhCliRunner:
    """Wraps subprocess invocations of the ``uh`` CLI.

    Tests inject a ``FakeUhCli`` via :func:`set_runner`; production swaps in
    the default class which calls :mod:`subprocess`.
    """

    def run_sync(self, args: list[str], cwd: Path, *, timeout: float) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [_uh_bin(), *args],
            cwd=str(cwd),
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )

    def spawn(self, args: list[str], cwd: Path) -> subprocess.Popen[str]:
        # stdout/stderr are intentionally DEVNULL: the CLI's user-facing
        # channel is events.ndjson (read by the SSE endpoint from disk), and
        # leaving the pipes attached without a reader risks a deadlock once
        # the OS pipe buffer fills (PR #89 finding #1).
        return subprocess.Popen(  # noqa: S603 — args are constructed from a closed set.
            [_uh_bin(), *args],
            cwd=str(cwd),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            text=True,
        )


_runner: _UhCliRunner = _UhCliRunner()


def set_runner(runner: _UhCliRunner) -> None:
    """Tests use this to inject a recording fake."""
    global _runner  # noqa: PLW0603
    _runner = runner


def get_runner() -> _UhCliRunner:
    return _runner


# ---------------------------------------------------------------------------
# YAML helpers.
# ---------------------------------------------------------------------------


def _read_yaml(path: Path) -> Optional[dict[str, Any]]:
    try:
        with path.open("r", encoding="utf-8") as fh:
            doc = yaml.safe_load(fh)
    except FileNotFoundError:
        return None
    except yaml.YAMLError as exc:
        raise _err(500, "yaml_parse", f"failed to parse {path.name}: {exc}") from exc
    if doc is None:
        return {}
    if not isinstance(doc, dict):
        raise _err(500, "yaml_shape", f"{path.name} is not a YAML mapping")
    return doc


def _read_text(path: Path, limit: Optional[int] = None) -> dict[str, Any]:
    if limit is None:
        # Lookup current module attr so tests can monkeypatch the cap.
        import sys as _sys
        limit = getattr(_sys.modules[__name__], "_MAX_ARTIFACT_BYTES", 5 * 1024 * 1024)
    try:
        size = path.stat().st_size
    except FileNotFoundError:
        return {"kind": "missing", "reason": f"{path.name} not produced yet"}
    if size > limit:
        raise _err(413, "too_large", f"{path.name} is {size} bytes; limit {limit}")
    with path.open("r", encoding="utf-8", errors="replace") as fh:
        return {"kind": "text", "content": fh.read()}


# ---------------------------------------------------------------------------
# Live runs registry (mission_id <-> [run_id]).
# ---------------------------------------------------------------------------


_active_runs: dict[str, dict[str, Any]] = {}
"""runId -> {missionId, started_at_iso, started_mono, process, status}.

We don't persist this; it's a lightweight in-memory map so the SSE endpoint
can resolve a runId to its events.ndjson path and the cancel endpoint can
SIGTERM the running CLI process. ``started_mono`` is the wallclock-independent
start instant we compare against ``_RUN_TIMEOUT_S`` from inside the SSE drain
loop. Server restart loses the map; the run files on disk are still
discoverable via :func:`_scan_runs`.
"""


def _make_run_id() -> str:
    ts = datetime.now(tz=timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return f"{ts}-{uuid.uuid4().hex[:8]}"


# Codex P2 round 5: keep _active_runs from growing unbounded. After a run
# reaches a terminal state we wait RUN_EVICTION_GRACE_S before removing the
# entry so the frontend can still fetch the final status. Tests monkeypatch
# this to 0 for fast eviction assertions.
_RUN_EVICTION_GRACE_S: float = 60.0


async def _evict_run_after_grace(run_id: str) -> None:
    try:
        await asyncio.sleep(_RUN_EVICTION_GRACE_S)
    except asyncio.CancelledError:
        return
    _active_runs.pop(run_id, None)


def _schedule_run_eviction(run_id: str) -> None:
    """Schedule the run's _active_runs entry for removal after a grace period.

    Idempotent: if called twice for the same run_id, the second call is a
    no-op (the existing eviction task already covers it).
    """
    info = _active_runs.get(run_id)
    if info is None or info.get("eviction") is not None:
        return
    info["eviction"] = asyncio.create_task(_evict_run_after_grace(run_id))


# ---------------------------------------------------------------------------
# Run events — shared NDJSON tail (UH-93).
# ---------------------------------------------------------------------------

_TERMINAL_EVENT_LABELS = frozenset({
    "runtime.cancelled",
    "runtime.finished",
    "runtime.timeout",
})

_active_sse_tails = 0


def _event_label(obj: dict[str, Any]) -> Optional[str]:
    for key in ("event", "kind", "type"):
        val = obj.get(key)
        if isinstance(val, str):
            return val
    return None


def _line_is_terminal(line: bytes) -> bool:
    try:
        obj = json.loads(line.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return False
    if not isinstance(obj, dict):
        return False
    label = _event_label(obj)
    return label in _TERMINAL_EVENT_LABELS if label is not None else False


def _run_events_path(root: Path, mission_id: str, run_id: str) -> Path:
    return _harness(root) / "missions" / mission_id / "runs" / run_id / "events.ndjson"


def _locate_run_events(
    root: Path, run_id: str, *, mission_id: Optional[str] = None,
) -> tuple[str, Path]:
    """Resolve ``(mission_id, events.ndjson path)`` for a run."""
    _safe_id(run_id, "run_id")
    if mission_id is not None:
        _safe_id(mission_id, "mission_id")
        events_path = _run_events_path(root, mission_id, run_id)
        run_dir = events_path.parent
        if not run_dir.is_dir():
            info = _active_runs.get(run_id)
            if info is not None and str(info.get("missionId")) == mission_id:
                return mission_id, events_path
            if _run_is_archived(root, mission_id, run_id):
                raise _err(
                    404,
                    "archived",
                    f"run {run_id} artifacts were pruned by the retention policy",
                )
            raise _err(404, "not_found", f"run {run_id} not found for mission {mission_id}")
        return mission_id, events_path
    info = _active_runs.get(run_id)
    if info is not None:
        mid = str(info["missionId"])
        return mid, _run_events_path(root, mid, run_id)
    missions_dir = _harness(root) / "missions"
    if missions_dir.is_dir():
        for entry in sorted(missions_dir.iterdir()):
            if not entry.is_dir():
                continue
            run_dir = entry / "runs" / run_id
            if run_dir.is_dir():
                return entry.name, run_dir / "events.ndjson"
    raise _err(404, "not_found", f"run {run_id} not found")


def _parse_events_ndjson(events_path: Path) -> list[dict[str, Any]]:
    if not events_path.is_file():
        return []
    try:
        text = events_path.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        raise _err(500, "io_error", f"cannot read events.ndjson: {exc}") from exc
    events: list[dict[str, Any]] = []
    for ln in text.splitlines():
        if not ln.strip():
            continue
        try:
            obj = json.loads(ln)
        except ValueError:
            continue
        if isinstance(obj, dict):
            events.append(obj)
    return events


def _historical_run_events_payload(
    root: Path, mission_id: str, run_id: str,
) -> dict[str, Any]:
    _, events_path = _locate_run_events(root, run_id, mission_id=mission_id)
    return {
        "mission_id": mission_id,
        "run_id": run_id,
        "events": _parse_events_ndjson(events_path),
    }


async def _iter_run_events_sse(
    events_path: Path,
    *,
    run_id: str,
    start_offset: int = 0,
    proc: Any = None,
    active_info: Optional[dict[str, Any]] = None,
) -> AsyncIterator[bytes]:
    """Tail ``events.ndjson`` for hot (live proc) and cold (finished) runs."""
    last_size = start_offset
    started_mono = (
        active_info.get("started_mono") if active_info is not None else time.monotonic()
    )
    last_event_mono = time.monotonic()
    import sys as _sys
    run_timeout = float(getattr(_sys.modules[__name__], "_RUN_TIMEOUT_S", 3600.0))
    keepalive_s = float(getattr(_sys.modules[__name__], "_SSE_KEEPALIVE_S", 15.0))
    poll_s = 0.2
    saw_terminal = False
    idle_polls_after_terminal = 0
    idle_polls_no_growth = 0
    # Cold/untracked tails without a terminal event: allow long idle gaps (Codex P1)
    # but still close abandoned streams (~30s at 0.2s poll).
    _COLD_IDLE_CLOSE_POLLS = 150

    def _drain_chunk() -> bytes:
        nonlocal last_size
        if not events_path.is_file():
            return b""
        with events_path.open("rb") as fh:
            fh.seek(last_size)
            data = fh.read()
            last_size += len(data)
        return data

    def _emit_chunk(chunk: bytes) -> list[bytes]:
        nonlocal saw_terminal, idle_polls_after_terminal, last_event_mono
        frames: list[bytes] = []
        if not chunk:
            return frames
        for line in chunk.splitlines():
            if not line:
                continue
            frames.append(b"data: " + line + b"\n\n")
            if _line_is_terminal(line):
                saw_terminal = True
        if frames:
            last_event_mono = time.monotonic()
            idle_polls_after_terminal = 0
        return frames

    if proc is not None:
        for _ in range(600):
            if events_path.is_file():
                break
            if proc.poll() is not None:
                break
            await asyncio.sleep(0.1)

    global _active_sse_tails
    _active_sse_tails += 1
    try:
        while True:
            chunk = _drain_chunk()
            for frame in _emit_chunk(chunk):
                yield frame

            now = time.monotonic()
            exited = proc.poll() is not None if proc is not None else True
            timed_out = (
                proc is not None
                and active_info is not None
                and (now - started_mono) > run_timeout
            )

            if (now - last_event_mono) >= keepalive_s:
                yield b": keepalive\n\n"
                last_event_mono = now

            if proc is None:
                if chunk:
                    idle_polls_no_growth = 0
                else:
                    idle_polls_no_growth += 1
                if saw_terminal:
                    idle_polls_after_terminal += 1
                    if idle_polls_after_terminal >= 2:
                        yield b"event: done\ndata: closed\n\n"
                        return
                elif idle_polls_no_growth >= _COLD_IDLE_CLOSE_POLLS:
                    yield b"event: done\ndata: closed\n\n"
                    return

            if proc is not None and (exited or timed_out):
                if timed_out and not exited:
                    try:
                        proc.terminate()
                    except (ProcessLookupError, OSError):
                        pass
                final = _drain_chunk()
                for frame in _emit_chunk(final):
                    yield frame
                if active_info is not None:
                    watchdog = active_info.get("watchdog")
                    if watchdog is not None and not watchdog.done():
                        watchdog.cancel()
                    if active_info.get("status") == "running":
                        active_info["status"] = "timeout" if timed_out else "finished"
                    if timed_out:
                        yield b"event: timeout\ndata: " + str(int(run_timeout)).encode() + b"s\n\n"
                    _schedule_run_eviction(run_id)
                yield b"event: done\ndata: closed\n\n"
                return

            if saw_terminal and proc is not None and exited:
                final = _drain_chunk()
                for frame in _emit_chunk(final):
                    yield frame
                if active_info is not None:
                    watchdog = active_info.get("watchdog")
                    if watchdog is not None and not watchdog.done():
                        watchdog.cancel()
                    if active_info.get("status") == "running":
                        active_info["status"] = "finished"
                    _schedule_run_eviction(run_id)
                yield b"event: done\ndata: closed\n\n"
                return

            await asyncio.sleep(poll_s)
    finally:
        _active_sse_tails -= 1


# ---------------------------------------------------------------------------
# Scanners (file-system fallback when --json subcommands don't exist).
# ---------------------------------------------------------------------------


def _scan_adapters(root: Path) -> list[dict[str, Any]]:
    """Read ``.harness/adapters/*.yaml`` and run ``uh adapter check`` per id."""
    adapters_dir = _harness(root) / "adapters"
    entries: list[dict[str, Any]] = []
    if not adapters_dir.is_dir():
        return entries
    for path in sorted(adapters_dir.glob("*.yaml")):
        doc = _read_yaml(path) or {}
        entry = {
            "id": str(doc.get("id") or path.stem),
            "runtime": str(doc.get("runtime") or "unknown"),
            "status": str(doc.get("status") or "unknown"),
            "check": None,
        }
        entries.append(entry)

    # Best-effort live check via the existing CLI.
    try:
        proc = _runner.run_sync(["adapter", "check"], cwd=root, timeout=_READ_TIMEOUT_S)
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return entries
    lines = (proc.stdout or "").splitlines()
    by_id = {e["id"]: e for e in entries}
    current: Optional[dict[str, Any]] = None
    for raw in lines:
        line = raw.rstrip()
        m = re.match(r"^\[(PASS|FAIL)] (\S+) adapter", line)
        if m:
            verdict, adapter_id = m.group(1), m.group(2)
            current = by_id.get(adapter_id)
            if current is not None:
                current["check"] = {"ok": verdict == "PASS"}
            continue
        if current is None:
            continue
        m_version = re.match(r"^\s+version:\s+(.+)$", line)
        if m_version and current["check"] is not None:
            current["check"]["version"] = m_version.group(1).strip()
            continue
        m_error = re.match(r"^\s+error:\s+(.+)$", line)
        if m_error and current["check"] is not None:
            current["check"]["error"] = m_error.group(1).strip()
            current["check"]["ok"] = False
    return entries


def _scan_missions(root: Path) -> list[dict[str, Any]]:
    missions_dir = _harness(root) / "missions"
    summaries: list[dict[str, Any]] = []
    if not missions_dir.is_dir():
        return summaries
    for entry in sorted(missions_dir.iterdir()):
        if not entry.is_dir():
            continue
        mission = _read_yaml(entry / "mission.yaml")
        if mission is None:
            continue
        runtime_result = _read_yaml(entry / "runtime-result.yaml") or {}
        verification = _read_yaml(entry / "verification.yaml") or {}
        promotion = _read_yaml(entry / "promotion.yaml") or {}
        status = _summarize_mission_status(runtime_result, verification, promotion)
        last_run = None
        if runtime_result:
            last_run = {
                "runId": runtime_result.get("run_id"),
                "status": runtime_result.get("status"),
                "startedAt": runtime_result.get("started_at"),
                "durationMs": runtime_result.get("duration_ms"),
            }
        summaries.append({
            "id": str(mission.get("id") or entry.name),
            "name": str(mission.get("name") or mission.get("title") or mission.get("id") or entry.name),
            "workflow_profile": str(mission.get("workflow_profile") or "unknown"),
            "status": status,
            "last_run": last_run,
        })
    return summaries


def _summarize_mission_status(
    runtime_result: dict[str, Any],
    verification: dict[str, Any],
    promotion: dict[str, Any],
) -> str:
    if promotion.get("decision") == "promoted":
        return "promoted"
    if verification.get("status") == "passed":
        return "verified"
    rt_status = runtime_result.get("status") if runtime_result else None
    # Codex P1 round 7: 'cancelled' is a terminal state; falling through to
    # the 'running' branch below would misreport a finished run as active
    # in /missions and /status, misleading operators during triage.
    if rt_status in {"failed", "blocked", "cancelled"}:
        return rt_status
    if rt_status == "passed":
        # Passed runtime + no verification yet ⇒ awaiting verify, but we
        # surface that to the UI as "verified" so the mission list isn't
        # cluttered with a transient state. Promote to a real
        # ``awaiting_verify`` only when the UI grows a column for it.
        return "verified"
    if runtime_result:
        return "running"
    return "draft"


def _scan_runs(root: Path, limit: int = 20) -> list[dict[str, Any]]:
    missions_dir = _harness(root) / "missions"
    rows: list[dict[str, Any]] = []
    if not missions_dir.is_dir():
        return rows
    for entry in sorted(missions_dir.iterdir()):
        if not entry.is_dir():
            continue
        rr = _read_yaml(entry / "runtime-result.yaml")
        if not rr:
            continue
        # Codex P2 round 6: the runId fallback must round-trip through
        # _SAFE_ID_RE so the UI can deep-link into /runs/{run_id}/... routes.
        # A real run_id is already safe (e.g. "20260519T120000Z-deadbeef");
        # only sanitize the started_at fallback, which is an ISO timestamp
        # containing `:` characters the regex rejects.
        explicit_run_id = rr.get("run_id")
        if explicit_run_id:
            safe_run_id = str(explicit_run_id)
        else:
            # Codex P2 round 12: ISO timestamps contain `:` and may include
            # `+00:00` offsets. The round-6 fix only replaced `:`, leaving
            # `+` chars that still fail _SAFE_ID_RE. Normalize any character
            # outside [A-Za-z0-9._-] to `-` so the resulting slug always
            # round-trips through the safe-id regex. Lstrip `-` so the slug
            # starts with [A-Za-z0-9] as the regex requires.
            fallback = str(rr.get("started_at") or entry.name)
            safe_run_id = re.sub(r"[^A-Za-z0-9._-]", "-", fallback).lstrip("-") or entry.name
        rows.append({
            "runId": safe_run_id,
            "missionId": str(rr.get("mission_id") or entry.name),
            "status": str(rr.get("status") or "unknown"),
            "startedAt": str(rr.get("started_at") or ""),
            "finishedAt": rr.get("finished_at"),
            "durationMs": rr.get("duration_ms"),
            "diffPaths": rr.get("diff_paths") or [],
        })
    rows.sort(key=lambda r: r.get("startedAt") or "", reverse=True)
    return rows[:limit]


def _scan_active_runs(root: Path) -> list[dict[str, Any]]:
    """UH-97: scan each mission's ``latest.json`` for in-flight runs.

    ``latest.json`` (uh.latest-run.v0) carries run_id/started_at/status but no
    mission_id, so the mission id is taken from the directory name. JSON parses
    cleanly via the YAML loader (JSON is a YAML subset)."""
    missions_dir = _harness(root) / "missions"
    rows: list[dict[str, Any]] = []
    if not missions_dir.is_dir():
        return rows
    for entry in sorted(missions_dir.iterdir()):
        if not entry.is_dir():
            continue
        pointer = _read_yaml(entry / "latest.json")
        if not isinstance(pointer, dict) or pointer.get("status") != "running":
            continue
        rows.append({
            "missionId": entry.name,
            "runId": str(pointer.get("run_id") or ""),
            "status": "running",
            "startedAt": str(pointer.get("started_at") or ""),
        })
    rows.sort(key=lambda r: r.get("startedAt") or "", reverse=True)
    return rows


# ---------------------------------------------------------------------------
# Router.
# ---------------------------------------------------------------------------


router = APIRouter()


@router.get("/status")
async def get_status() -> dict[str, Any]:
    root = _project_root()
    project = _read_yaml(_harness(root) / "project.yaml") or {}
    workflows_dir = _harness(root) / "workflows"
    workflows = len(list(workflows_dir.glob("*.yaml"))) if workflows_dir.is_dir() else 0
    missions = _scan_missions(root)
    sandboxes_index = _read_yaml(_harness(root) / "sandboxes" / "index.yaml") or {}
    sandbox_entries = sandboxes_index.get("entries") or sandboxes_index.get("sandboxes") or []
    by_status: dict[str, int] = {}
    for sb in sandbox_entries:
        s = str(sb.get("status") or "unknown")
        by_status[s] = by_status.get(s, 0) + 1
    audit_path = _harness(root) / "audit" / "events.ndjson"
    audit_lines = 0
    if audit_path.is_file():
        try:
            audit_lines = sum(1 for _ in audit_path.open("r", encoding="utf-8", errors="replace"))
        except OSError:
            audit_lines = 0
    return {
        "schema_version": str(project.get("schema_version") or "unknown"),
        "project_name": str(project.get("name") or "unknown"),
        "adapters": _scan_adapters(root),
        "workflows": workflows,
        "missions": {
            "active": len(missions),
            "verified": sum(1 for m in missions if m["status"] in {"verified", "promoted"}),
            "promoted": sum(1 for m in missions if m["status"] == "promoted"),
        },
        "sandboxes": {"total": len(sandbox_entries), "by_status": by_status},
        "recent_audit_events": audit_lines,
    }


@router.get("/adapters/capabilities")
async def get_adapter_capabilities() -> dict[str, Any]:
    """UH-104: typed adapter capability manifests (tools, sandbox, cost class)."""
    root = _project_root()
    try:
        proc = _runner.run_sync(["adapter", "capabilities", "--json"], cwd=root, timeout=_READ_TIMEOUT_S)
    except FileNotFoundError as exc:
        raise _err(500, "uh_cli_missing", "uh CLI not found on PATH") from exc
    except subprocess.TimeoutExpired as exc:
        raise _err(504, "uh_cli_timeout", "uh adapter capabilities timed out") from exc
    if proc.returncode != 0:
        raise _err(500, "uh_cli_error", "uh adapter capabilities failed", details=(proc.stderr or "").strip())
    try:
        return json.loads(proc.stdout or "{}")
    except json.JSONDecodeError as exc:
        raise _err(500, "bad_json", "invalid JSON from uh adapter capabilities", details=str(exc)) from exc


@router.post("/missions/{mission_id}/cost-forecast")
async def post_cost_forecast(mission_id: str, request: Request) -> dict[str, Any]:
    """UH-104: forecast token cost for a mission via ``uh adapter cost-forecast``."""
    _safe_id(mission_id, "mission_id")
    body = await _json_body(request)
    adapter = body.get("adapter") or "auto"
    if not isinstance(adapter, str):
        raise _err(400, "invalid_adapter", "adapter must be a string")
    if adapter != "auto" and not re.fullmatch(r"[a-z0-9][a-z0-9-]*", adapter):
        raise _err(400, "invalid_adapter", "adapter must be 'auto' or an adapter id")
    root = _project_root()
    try:
        proc = _runner.run_sync(
            ["adapter", "cost-forecast", "--mission", mission_id, "--adapter", adapter, "--json"],
            cwd=root,
            timeout=_READ_TIMEOUT_S,
        )
    except FileNotFoundError as exc:
        raise _err(500, "uh_cli_missing", "uh CLI not found on PATH") from exc
    except subprocess.TimeoutExpired as exc:
        raise _err(504, "uh_cli_timeout", "cost-forecast timed out") from exc
    if proc.returncode != 0:
        raise _err(400, "forecast_failed", "cost-forecast failed", details=(proc.stderr or proc.stdout or "").strip())
    try:
        return json.loads(proc.stdout or "{}")
    except json.JSONDecodeError as exc:
        raise _err(500, "bad_json", "invalid JSON from cost-forecast", details=str(exc)) from exc


@router.get("/missions")
async def list_missions() -> dict[str, list[dict[str, Any]]]:
    return {"missions": _scan_missions(_project_root())}


@router.get("/missions/{mission_id}")
async def get_mission(mission_id: str) -> dict[str, Any]:
    _safe_id(mission_id, "mission_id")
    root = _project_root()
    mission_dir = _harness(root) / "missions" / mission_id
    mission_yaml = mission_dir / "mission.yaml"
    raw = mission_yaml.read_text(encoding="utf-8") if mission_yaml.is_file() else None
    if raw is None:
        raise _err(404, "not_found", f"mission {mission_id} not found")
    try:
        doc = yaml.safe_load(raw) or {}
    except yaml.YAMLError as exc:
        raise _err(400, "malformed_yaml", "malformed mission yaml", details=str(exc)) from exc
    if not isinstance(doc, dict):
        raise _err(400, "malformed_yaml", "mission yaml is not a mapping")
    # Codex P2 round 9: only build a summary from the requested mission.
    # Calling _scan_missions(root) here parses every mission directory; a
    # malformed YAML in an unrelated mission would surface as a 500 on this
    # endpoint and break drilldown for every mission. Read just this one.
    summary: dict[str, Any] = {
        "id": mission_id,
        "name": str(doc.get("name") or doc.get("title") or mission_id),
        "workflow_profile": str(doc.get("workflow_profile") or "unknown"),
    }
    # Surface status + last_run from THIS mission's runtime-result.yaml.
    # We tolerate this mission's runtime-result being malformed (last_run
    # stays unset); the mission's own mission.yaml has already been parsed
    # successfully above, so we still produce a usable detail response.
    rr_path = mission_dir / "runtime-result.yaml"
    if rr_path.is_file():
        try:
            rr = yaml.safe_load(rr_path.read_text(encoding="utf-8")) or {}
            if isinstance(rr, dict):
                ver_path = mission_dir / "verification.yaml"
                ver = {}
                if ver_path.is_file():
                    try:
                        ver_doc = yaml.safe_load(ver_path.read_text(encoding="utf-8")) or {}
                        if isinstance(ver_doc, dict):
                            ver = ver_doc
                    except yaml.YAMLError:
                        pass
                prom_path = mission_dir / "promotion.yaml"
                prom = {}
                if prom_path.is_file():
                    try:
                        prom_doc = yaml.safe_load(prom_path.read_text(encoding="utf-8")) or {}
                        if isinstance(prom_doc, dict):
                            prom = prom_doc
                    except yaml.YAMLError:
                        pass
                summary["status"] = _summarize_mission_status(rr, ver, prom)
                summary["last_run"] = {
                    # Codex P2 round 11: last_run must carry runId, not just
                    # runtime — the /missions list rows and the TS
                    # MissionSummary type both expect runId for deep-links.
                    "runId": rr.get("run_id"),
                    "runtime": rr.get("runtime"),
                    "status": rr.get("status"),
                    "startedAt": rr.get("started_at"),
                    "durationMs": rr.get("duration_ms"),
                }
        except yaml.YAMLError:
            pass
    summary.setdefault("status", "draft")
    # UH-82: surface the per-run history from runs/index.json so the
    # frontend can render a run picker / timeline without scanning the
    # filesystem itself. Cap at 50 newest-first to keep the response
    # bounded; consumers needing more can paginate via a future endpoint.
    runs_list: list[dict[str, Any]] = []
    runs_index_path = mission_dir / "runs" / "index.json"
    if runs_index_path.is_file():
        try:
            idx = json.loads(runs_index_path.read_text(encoding="utf-8"))
            if isinstance(idx, dict) and isinstance(idx.get("runs"), list):
                for entry in idx["runs"]:
                    if not isinstance(entry, dict):
                        continue
                    runs_list.append({
                        "run_id": str(entry.get("run_id") or ""),
                        "started_at": str(entry.get("started_at") or ""),
                        "finished_at": entry.get("finished_at"),
                        "status": str(entry.get("status") or ""),
                        "runtime": entry.get("runtime"),
                        # UH-90: surface the retention flag so the frontend
                        # can render an "archived" badge and short-circuit
                        # artifact fetches for pruned runs.
                        "archived": entry.get("archived") is True,
                    })
        except (OSError, ValueError):
            # Corrupt index: omit; caller still gets summary + last_run.
            pass
    # Newest first; cap at 50.
    runs_list = list(reversed(runs_list))[:50]
    # UH-82: if latest.json exists, surface its run_id alongside last_run.
    latest_pointer_path = mission_dir / "latest.json"
    if latest_pointer_path.is_file():
        try:
            pointer = json.loads(latest_pointer_path.read_text(encoding="utf-8"))
            if isinstance(pointer, dict) and pointer.get("run_id"):
                summary.setdefault("last_run_id", str(pointer["run_id"]))
        except (OSError, ValueError):
            pass
    return {
        **summary,
        "id": mission_id,
        "description": str(doc.get("description") or doc.get("objective") or ""),
        "read_first": list(doc.get("read_first") or (doc.get("context") or {}).get("read_first") or []),
        "expected_artifacts": [
            {"path": str(a.get("path")), "type": a.get("type")}
            for a in (doc.get("expected_artifacts") or [])
            if isinstance(a, dict) and a.get("path")
        ],
        "acceptance_criteria": [
            {"id": str(ac.get("id")), "description": str(ac.get("description") or ""), "severity": ac.get("severity")}
            for ac in (doc.get("acceptance_criteria") or [])
            if isinstance(ac, dict) and ac.get("id")
        ],
        "capabilities": [str(c) for c in (doc.get("capabilities") or [])],
        "raw": raw,
        "runs": runs_list,
    }


@router.get("/runs")
async def list_runs(limit: int = 20) -> dict[str, list[dict[str, Any]]]:
    limit = max(1, min(int(limit), 200))
    return {"runs": _scan_runs(_project_root(), limit=limit)}


@router.get("/runs/active")
async def list_active_runs() -> dict[str, list[dict[str, Any]]]:
    """UH-97: missions with an in-flight run (latest.json status == running)."""
    return {"runs": _scan_active_runs(_project_root())}


# ---------------------------------------------------------------------------
# UH-90 — retention. Python mirror of src/harness/run-id.ts:pruneOldRuns.
# Both sides exist on purpose: the TS pruner is for `uh validate --repair`
# (future CLI knob, currently dormant), the Python one is for the plugin's
# start_run path so we don't shell out to the CLI just to drop directories.
# ---------------------------------------------------------------------------


def _prune_old_runs(root: Path, mission_id: str, max_runs: int) -> int:
    """Mark the N oldest non-archived entries as archived and rm -rf their
    per-run dirs. Returns the count actually pruned (0 if cap not exceeded
    or there is no index yet). Idempotent on repeated invocation.

    Mirrors the TS pruner exactly:
      * `max_runs` must be a positive integer; non-positive throws.
      * Already-archived entries don't count against the cap.
      * Sort by started_at ASC, tie-break on run_id, slice oldest.
      * Atomic index rewrite via tempfile + os.replace.
    """
    if not isinstance(max_runs, int) or isinstance(max_runs, bool) or max_runs <= 0:
        raise ValueError("max_runs_per_mission must be a positive integer or null")
    index_path = _harness(root) / "missions" / mission_id / "runs" / "index.json"
    try:
        with index_path.open("r", encoding="utf-8") as fh:
            current = json.load(fh)
    except (OSError, ValueError):
        return 0
    if not isinstance(current, dict) or not isinstance(current.get("runs"), list):
        return 0
    runs: list[dict[str, Any]] = [r for r in current["runs"] if isinstance(r, dict)]
    non_archived = [r for r in runs if r.get("archived") is not True]
    if len(non_archived) <= max_runs:
        return 0
    oldest_first = sorted(
        non_archived,
        key=lambda r: (str(r.get("started_at") or ""), str(r.get("run_id") or "")),
    )
    prune_count = len(non_archived) - max_runs
    to_prune = oldest_first[:prune_count]
    archived_ids = {str(r.get("run_id") or "") for r in to_prune}
    for entry in runs:
        if str(entry.get("run_id") or "") in archived_ids:
            entry["archived"] = True
    current["runs"] = runs
    # Best-effort per-run dir removal. shutil.rmtree with ignore_errors=True
    # converges on a partial-prior-failure state.
    runs_dir = _harness(root) / "missions" / mission_id / "runs"
    for entry in to_prune:
        run_id = str(entry.get("run_id") or "")
        if not run_id:
            continue
        shutil.rmtree(runs_dir / run_id, ignore_errors=True)
    # Atomic write via tempfile + os.replace. Unique tmp name avoids the
    # same writer-collision class the TS appendRunsIndexEntry fixed in
    # PR #96.
    fd, tmp_name = tempfile.mkstemp(
        prefix="index.", suffix=".tmp", dir=str(index_path.parent)
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as tmp_fh:
            json.dump(current, tmp_fh, indent=2)
        os.replace(tmp_name, index_path)
    except Exception:
        # If anything below mkstemp failed, clean up the staging file so
        # we don't leak it; os.replace already removes its source on
        # success.
        try:
            os.unlink(tmp_name)
        except OSError:
            pass
        raise
    return prune_count


@router.post("/missions/{mission_id}/run")
async def start_run(mission_id: str, request: Request) -> dict[str, Any]:
    _safe_id(mission_id, "mission_id")
    body = await _json_body(request)
    overrides = body.get("runtime_config_overrides") or {}
    if not isinstance(overrides, dict):
        raise _err(400, "invalid_overrides", "runtime_config_overrides must be an object")
    # UH-87: optional `replay_of` records the source run id whose
    # overrides + prompt the operator lifted. The new run executes
    # identically to a fresh run — `replay_of` is pure lineage metadata
    # surfaced in runs/index.json. Validated through _safe_id so a
    # forged run_id can't escape into the index payload.
    replay_of_raw = body.get("replay_of")
    replay_of: Optional[str] = None
    if replay_of_raw is not None:
        if not isinstance(replay_of_raw, str):
            raise _err(400, "invalid_replay_of", "replay_of must be a string")
        _safe_id(replay_of_raw, "replay_of")
        replay_of = replay_of_raw
    # UH-81 (shipped): the CLI now consumes `--runtime-config-overrides <json>`
    # and threads the parsed object through all four adapter planners on top
    # of `mission.runtime_config_overrides`. We forward the JSON-encoded
    # overrides as a single argv element; Popen is invoked with a list (no
    # shell), so embedded quotes/spaces are safe.
    overrides_arg: str | None = None
    if overrides:
        # Codex P2 (PR #95): strict-finite JSON only. Python's json.dumps
        # accepts NaN/Infinity by default and emits them as bare tokens
        # (e.g. `{"temperature":NaN}`), which Node's JSON.parse — used by
        # parseRuntimeConfigOverridesJson on the CLI side — rejects. Without
        # allow_nan=False the dashboard would happily spawn the run and the
        # CLI would then exit 1 with [BLOCKED] invalid JSON. Reject up-front
        # with a 400 so the operator sees the validation error in the UI.
        try:
            overrides_arg = json.dumps(overrides, separators=(",", ":"), allow_nan=False)
        except ValueError as exc:
            raise _err(
                400,
                "invalid_overrides",
                f"runtime_config_overrides contains non-finite numeric values: {exc}",
                fields={"runtime_config_overrides": "NaN / Infinity not allowed"},
            ) from exc
        if len(overrides_arg.encode("utf-8")) > _MAX_OVERRIDES_JSON_BYTES:
            raise _err(
                400,
                "overrides_too_large",
                f"runtime_config_overrides JSON exceeds {_MAX_OVERRIDES_JSON_BYTES} bytes; "
                "trim the override block or raise UH_MAX_OVERRIDES_JSON_BYTES.",
                fields={"runtime_config_overrides": "too large"},
            )

    root = _project_root()
    mission_yaml = _harness(root) / "missions" / mission_id / "mission.yaml"
    if not mission_yaml.is_file():
        raise _err(404, "not_found", f"mission {mission_id} not found")
    # UH-90 — retention prune. Run before generating the new run_id so the
    # pruner sees only previously-recorded runs; dynamic read mirrors the
    # `_RUN_TIMEOUT_S` pattern so tests can monkeypatch the cap after import.
    import sys as _sys_uh90
    cap = getattr(_sys_uh90.modules[__name__], "_MAX_RUNS_PER_MISSION", None)
    if isinstance(cap, int) and not isinstance(cap, bool) and cap > 0:
        try:
            _prune_old_runs(root, mission_id, cap)
        except (OSError, ValueError) as exc:  # pragma: no cover — fail-soft
            _logger.warning("UH-90: prune failed for mission %s: %s", mission_id, exc)
    run_id = _make_run_id()
    # UH-82: per-run artifact directories eliminate the interleave hazard
    # that motivated the previous 409 `run_already_active` guard. The
    # plugin now passes `--run-id <id>` to the CLI so both sides agree on
    # a single `runs/<run_id>/` directory per run.
    # Codex P1 round 3: the CLI takes a mission file PATH, not the id slug.
    # Codex P1 round 13: pass --no-sandbox so the run doesn't get rerouted
    # into a sandbox worktree. The dashboard's spawn semantic is "run THIS
    # mission against THIS root"; sandbox routing would skip artifact
    # persistence in the canonical mission dir, leaving the plugin with no
    # events / runtime-result to surface.
    args = [
        "mission", "run", str(mission_yaml),
        "--root", str(root),
        "--no-sandbox",
        "--run-id", run_id,
    ]
    if overrides_arg is not None:
        args.extend(["--runtime-config-overrides", overrides_arg])
    started_iso = datetime.now(tz=timezone.utc).isoformat()
    if replay_of is not None:
        # Pre-populate the runs/index.json row with the replay_of
        # breadcrumb BEFORE the adapter writes its own running row. The
        # adapter's `appendRunsIndexEntry` preserves replay_of when it
        # replaces an existing row by run_id (see run-id.ts).
        _append_runs_index_row(
            root,
            mission_id,
            {
                "run_id": run_id,
                "started_at": started_iso,
                "status": "running",
                "replay_of": replay_of,
            },
        )
    events_path = _harness(root) / "missions" / mission_id / "runs" / run_id / "events.ndjson"
    # Codex P1 round 8: capture the events.ndjson byte offset BEFORE spawning
    # the child process. If we snapshot after spawn, a fast CLI can append
    # the first events (runtime.started) between spawn() and stat(), and the
    # SSE tail then skips those initial events because last_size starts past
    # them. Sampling before spawn means any new bytes written by the spawned
    # process are guaranteed to land beyond last_size.
    try:
        started_byte_offset = events_path.stat().st_size if events_path.is_file() else 0
    except OSError:
        started_byte_offset = 0
    try:
        proc = _runner.spawn(args, cwd=root)
    except FileNotFoundError as exc:
        raise _err(500, "uh_missing", f"uh CLI binary not found: {exc}") from exc
    info: dict[str, Any] = {
        "missionId": mission_id,
        "startedAt": started_iso,
        "started_mono": time.monotonic(),
        "started_byte_offset": started_byte_offset,
        "process": proc,
        "status": "running",
    }
    _active_runs[run_id] = info
    # Dynamic read so tests that monkeypatch ``_RUN_TIMEOUT_S`` after import
    # still see the new value when starting a run.
    import sys as _sys
    timeout_s = float(getattr(_sys.modules[__name__], "_RUN_TIMEOUT_S", 3600.0))
    # Background watchdog: SIGTERMs the child if it outlives the timeout,
    # even when no SSE consumer is attached (PR #89 finding #2).
    info["watchdog"] = asyncio.create_task(
        _enforce_run_timeout(run_id, info, events_path, timeout_s)
    )
    return {"runId": run_id, "startedAt": started_iso}


async def _enforce_run_timeout(
    run_id: str,
    info: dict[str, Any],
    events_path: Path,
    timeout_s: float,
) -> None:
    """Terminate a hung child after ``timeout_s`` without an attached reader.

    Idempotent with the SSE drain loop: both share ``info`` and use a
    defensive ``proc.terminate()`` so whichever fires first wins. A natural
    exit before the deadline makes this a no-op.
    """
    # Codex P2 round 9: poll for natural exit at small intervals instead of
    # sleeping the full timeout. Without this, a naturally-completed run
    # with no SSE consumer attached stayed in _active_runs as 'running' for
    # up to _RUN_TIMEOUT_S (default 3600s). Poll every 1s — cheap, and the
    # watchdog covers the no-SSE path on the order of seconds, not hours.
    elapsed = 0.0
    poll_interval = 1.0
    while elapsed < timeout_s:
        try:
            await asyncio.sleep(min(poll_interval, timeout_s - elapsed))
        except asyncio.CancelledError:
            return
        elapsed += poll_interval
        proc = info.get("process")
        if proc is None:
            return
        if proc.poll() is not None:
            # Natural exit — handle as the round-8 fast path.
            if info.get("status") == "running":
                info["status"] = "finished"
            _schedule_run_eviction(run_id)
            return
    # Timeout expired without exit — fall through to the SIGTERM path below.
    proc = info.get("process")
    if proc is None:
        return
    if proc.poll() is not None:
        # Codex P1 round 8: child already exited (natural completion before
        # the timeout). When no SSE consumer attached, the SSE drain loop
        # never ran — so we must update status and schedule eviction
        # ourselves, or _active_runs stays stuck as 'running' indefinitely.
        # Only flip status if we still owned 'running'; respect cancel/
        # timeout terminal states (round 6 P2).
        if info.get("status") == "running":
            info["status"] = "finished"
        _schedule_run_eviction(run_id)
        return
    try:
        proc.terminate()
    except (ProcessLookupError, OSError):
        pass
    info["status"] = "timeout"
    try:
        events_path.parent.mkdir(parents=True, exist_ok=True)
        with events_path.open("a", encoding="utf-8") as fh:
            fh.write(
                json.dumps(
                    {"type": "runtime.timeout", "run_id": run_id, "timeout_s": timeout_s}
                )
                + "\n"
            )
    except OSError:
        # Disk failure shouldn't mask the in-memory timeout signal.
        pass
    # Codex P2 round 5: watchdog also evicts so a run that times out without
    # any SSE consumer doesn't linger in _active_runs forever.
    _schedule_run_eviction(run_id)

def _events_show_terminal(events_path: Path) -> bool:
    if not events_path.is_file():
        return False
    try:
        text = events_path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return False
    for ln in text.splitlines():
        stripped = ln.strip()
        if stripped and _line_is_terminal(stripped.encode("utf-8")):
            return True
    return False


def _append_runtime_cancelled_event(
    events_path: Path,
    *,
    mission_id: str,
    run_id: str,
    source: str = "plugin-api",
) -> None:
    try:
        events_path.parent.mkdir(parents=True, exist_ok=True)
        with events_path.open("a", encoding="utf-8") as fh:
            fh.write(
                json.dumps(
                    {
                        "event": "runtime.cancelled",
                        "timestamp": datetime.now(tz=timezone.utc).isoformat(),
                        "mission_id": mission_id,
                        "run_id": run_id,
                        "signal": "SIGTERM",
                        "source": source,
                    },
                    separators=(",", ":"),
                )
                + "\n"
            )
    except OSError:
        pass


@router.post("/runs/{run_id}/cancel")
async def cancel_run(run_id: str) -> dict[str, Any]:
    _safe_id(run_id, "run_id")
    root = _project_root()
    info = _active_runs.get(run_id)
    if info is None:
        try:
            _, events_path = _locate_run_events(root, run_id)
        except HTTPException:
            raise
        if _events_show_terminal(events_path):
            raise _err(409, "already_finished", f"run {run_id} already finished")
        raise _err(404, "not_found", f"run {run_id} not tracked (server may have restarted)")
    mission_id = str(info["missionId"])
    events_path = _run_events_path(root, mission_id, run_id)
    proc: subprocess.Popen[str] = info["process"]
    wrote_cancel_event = False
    if proc.poll() is None:
        # Codex P2 round 10: there is a race between the poll() above and
        # terminate(). The child may exit naturally in that window. On
        # POSIX that surfaces as ProcessLookupError, on Windows as OSError;
        # `terminate_failed` flags that path so we don't misreport a
        # naturally-completed run as cancelled.
        terminate_failed = False
        try:
            proc.terminate()
        except (ProcessLookupError, OSError):
            terminate_failed = True
        proc.poll()
        if terminate_failed:
            # The child was already gone — this was a natural exit, not a
            # cancel. Only flip status if we still own 'running' (respect
            # any terminal state already set by the watchdog / SSE drain).
            if info.get("status") == "running":
                info["status"] = "finished"
        else:
            info["status"] = "cancelled"
            wrote_cancel_event = True
    elif _events_show_terminal(events_path) or info.get("status") not in (None, "running"):
        raise _err(409, "already_finished", f"run {run_id} already finished")
    watchdog = info.get("watchdog")
    if watchdog is not None and not watchdog.done():
        watchdog.cancel()
    if wrote_cancel_event:
        _append_runtime_cancelled_event(
            events_path,
            mission_id=mission_id,
            run_id=run_id,
            source="plugin-ui",
        )
    # Codex P2 round 5: terminal state — schedule registry eviction.
    _schedule_run_eviction(run_id)
    return {"ok": True, "status": info["status"]}


@router.get("/runs/{run_id}/events")
async def stream_run_events(run_id: str) -> StreamingResponse:
    """SSE tail for a run (active or on-disk cold runs)."""
    root = _project_root()
    info = _active_runs.get(run_id)
    if info is not None:
        mission_id = str(info["missionId"])
        events_path = _run_events_path(root, mission_id, run_id)
        start_offset = int(info.get("started_byte_offset") or 0)
        proc = info["process"]
        active_info = info
    else:
        _, events_path = _locate_run_events(root, run_id)
        start_offset = 0
        proc = None
        active_info = None

    async def gen() -> AsyncIterator[bytes]:
        async for frame in _iter_run_events_sse(
            events_path,
            run_id=run_id,
            start_offset=start_offset,
            proc=proc,
            active_info=active_info,
        ):
            yield frame

    return StreamingResponse(gen(), media_type="text/event-stream")


@router.get("/missions/{mission_id}/runs/{run_id}/events")
async def mission_run_events(
    mission_id: str,
    run_id: str,
    stream: int = Query(0, ge=0, le=1, description="1 for SSE tail, 0 for JSON history"),
) -> Any:
    """UH-93 — mission-scoped run events (SSE or historical JSON)."""
    root = _project_root()
    if stream:
        _, events_path = _locate_run_events(root, run_id, mission_id=mission_id)
        info = _active_runs.get(run_id)
        if info is not None and str(info.get("missionId")) == mission_id:
            start_offset = int(info.get("started_byte_offset") or 0)
            proc = info["process"]
            active_info = info
        else:
            start_offset = 0
            proc = None
            active_info = None

        async def gen() -> AsyncIterator[bytes]:
            async for frame in _iter_run_events_sse(
                events_path,
                run_id=run_id,
                start_offset=start_offset,
                proc=proc,
                active_info=active_info,
            ):
                yield frame

        return StreamingResponse(gen(), media_type="text/event-stream")
    return _historical_run_events_payload(root, mission_id, run_id)


# ---- artifact endpoints (UH-63) --------------------------------------------


def _artifact_response_at(base: Path, filename: str) -> dict[str, Any]:
    """Bounded reader for an artifact at `<base>/<filename>`.

    Refuses to follow symlinks or paths that resolve outside `base`. Used
    by both the mission-level `/missions/{id}/<kind>` routes (UH-63) and
    the per-run `/missions/{id}/runs/{run_id}/<kind>` routes (UH-82).
    """
    candidate = base / filename
    # Codex P2 round 13: artifact paths must stay inside the bound base
    # directory. A symlinked artifact (e.g. prompt.md -> /etc/passwd) would
    # otherwise be followed by _read_text and disclosed via the dashboard.
    if candidate.exists() and candidate.is_symlink():
        raise _err(400, "symlink_artifact", f"artifact {filename} is a symlink; refusing to read")
    try:
        resolved = candidate.resolve(strict=False)
        base_resolved = base.resolve(strict=False)
    except OSError as exc:
        raise _err(500, "io_error", f"cannot resolve artifact path: {exc}") from exc
    if base_resolved not in resolved.parents and resolved != base_resolved:
        raise _err(400, "path_escape", f"artifact {filename} resolves outside base directory")
    return _read_text(candidate)


def _artifact_response(mission_id: str, filename: str) -> dict[str, Any]:
    _safe_id(mission_id, "mission_id")
    mission_dir = _harness(_project_root()) / "missions" / mission_id
    return _artifact_response_at(mission_dir, filename)


@router.get("/missions/{mission_id}/prompt")
async def get_prompt(mission_id: str) -> dict[str, Any]:
    return _artifact_response(mission_id, "prompt.md")


@router.get("/missions/{mission_id}/final-message")
async def get_final_message(mission_id: str) -> dict[str, Any]:
    return _artifact_response(mission_id, "runtime-final.txt")


@router.get("/missions/{mission_id}/diff")
async def get_diff(mission_id: str) -> dict[str, Any]:
    return _artifact_response(mission_id, "diff.patch")


@router.get("/missions/{mission_id}/result")
async def get_result(mission_id: str) -> dict[str, Any]:
    return _artifact_response(mission_id, "runtime-result.yaml")


@router.get("/missions/{mission_id}/events")
async def get_mission_events(mission_id: str) -> dict[str, Any]:
    return _artifact_response(mission_id, "events.ndjson")


def _run_is_archived(root: Path, mission_id: str, run_id: str) -> bool:
    """Look up `run_id` in `runs/index.json` and return True iff the entry
    is marked `archived: true`. Used by the per-run artifact route to
    distinguish UH-90 retention pruning from a genuinely missing run."""
    index_path = _harness(root) / "missions" / mission_id / "runs" / "index.json"
    try:
        with index_path.open("r", encoding="utf-8") as fh:
            idx = json.load(fh)
    except (OSError, ValueError):
        return False
    if not isinstance(idx, dict) or not isinstance(idx.get("runs"), list):
        return False
    for entry in idx["runs"]:
        if isinstance(entry, dict) and entry.get("run_id") == run_id:
            return entry.get("archived") is True
    return False
# ---- compare + replay (UH-87 / UH-89) --------------------------------------


_COMPARE_EVENTS_CAP = 500


def _read_text_or_none(base: Path, filename: str) -> Optional[str]:
    """Bounded reader that returns text content or None when missing.

    Mirrors `_artifact_response_at`'s safety posture (symlink + escape
    refusal -> None instead of raising) so the compare endpoint can
    surface "missing artifact" as `null` per-side without aborting the
    whole comparison."""
    candidate = base / filename
    if candidate.exists() and candidate.is_symlink():
        return None
    try:
        resolved = candidate.resolve(strict=False)
        base_resolved = base.resolve(strict=False)
    except OSError:
        return None
    if base_resolved not in resolved.parents and resolved != base_resolved:
        return None
    try:
        if not candidate.is_file():
            return None
        size = candidate.stat().st_size
    except OSError:
        return None
    import sys as _sys
    limit = getattr(_sys.modules[__name__], "_MAX_ARTIFACT_BYTES", 5 * 1024 * 1024)
    if size > limit:
        return None
    with candidate.open("r", encoding="utf-8", errors="replace") as fh:
        return fh.read()


def _compare_side(mission_dir: Path, run_id: str) -> dict[str, Any]:
    run_dir = mission_dir / "runs" / run_id
    prompt = _read_text_or_none(run_dir, "prompt.md")
    final_message = _read_text_or_none(run_dir, "runtime-final.txt")
    diff = _read_text_or_none(run_dir, "diff.patch")
    runtime_result: Optional[dict[str, Any]] = None
    rr_text = _read_text_or_none(run_dir, "runtime-result.yaml")
    if rr_text is not None:
        try:
            parsed = yaml.safe_load(rr_text)
        except yaml.YAMLError:
            parsed = None
        if isinstance(parsed, dict):
            runtime_result = parsed
    events: list[dict[str, Any]] = []
    truncated_to: Optional[int] = None
    events_text = _read_text_or_none(run_dir, "events.ndjson")
    if events_text is not None:
        lines = [ln for ln in events_text.splitlines() if ln.strip()]
        if len(lines) > _COMPARE_EVENTS_CAP:
            # Keep the most recent N — terminal events are what an
            # operator usually wants when comparing two runs.
            lines = lines[-_COMPARE_EVENTS_CAP:]
            truncated_to = _COMPARE_EVENTS_CAP
        for ln in lines:
            try:
                obj = json.loads(ln)
            except ValueError:
                continue
            if isinstance(obj, dict):
                events.append(obj)
    side: dict[str, Any] = {
        "run_id": run_id,
        "prompt": prompt,
        "final_message": final_message,
        "diff": diff,
        "runtime_result": runtime_result,
        "events": events,
    }
    if truncated_to is not None:
        side["truncated_to"] = truncated_to
    return side


@router.get("/missions/{mission_id}/compare")
async def compare_runs(mission_id: str, a: str, b: str) -> dict[str, Any]:
    """UH-89 — side-by-side comparison of two runs of the same mission.

    Returns prompt, final message, diff, parsed runtime-result, and the
    most recent 500 events for each side. 400 when the caller asks to
    compare a run against itself; 404 when either run directory is
    missing.
    """
    _safe_id(mission_id, "mission_id")
    _safe_id(a, "a")
    _safe_id(b, "b")
    if a == b:
        raise _err(400, "same_run", "compare requires two distinct run ids")
    root = _project_root()
    mission_dir = _harness(root) / "missions" / mission_id
    for rid in (a, b):
        if not (mission_dir / "runs" / rid).is_dir():
            raise _err(404, "not_found", f"run {rid} not found for mission {mission_id}")
    return {
        "mission_id": mission_id,
        "a": _compare_side(mission_dir, a),
        "b": _compare_side(mission_dir, b),
    }


@router.get("/missions/{mission_id}/runs/{run_id}/overrides")
async def get_run_overrides(mission_id: str, run_id: str) -> dict[str, Any]:
    """UH-87 — surface the prior run's `runtime_config` so the Run modal
    can pre-fill the JSON textarea for a replay.

    Reads `runs/<run_id>/runtime-session.yaml`. When the file is absent
    or the block is empty, returns `{ runtime_config_overrides: {} }`
    rather than 404 — operators can still replay from a clean slate.
    """
    _safe_id(mission_id, "mission_id")
    _safe_id(run_id, "run_id")
    session_path = (
        _harness(_project_root()) / "missions" / mission_id / "runs" / run_id / "runtime-session.yaml"
    )
    empty = {"runtime_config_overrides": {}}
    if not session_path.is_file():
        return empty
    try:
        with session_path.open("r", encoding="utf-8") as fh:
            doc = yaml.safe_load(fh)
    except yaml.YAMLError:
        return empty
    if not isinstance(doc, dict):
        return empty
    block = doc.get("runtime_config")
    if not isinstance(block, dict):
        return empty
    return {"runtime_config_overrides": block}


def _append_runs_index_row(root: Path, mission_id: str, entry: dict[str, Any]) -> None:
    """Python-side mirror of `appendRunsIndexEntry` in `src/harness/run-id.ts`.

    Used by `start_run` to pre-write a `replay_of` breadcrumb so the
    runs/index.json row carries the lineage even before the adapter's
    first write. The TS adapter preserves `replay_of` on row replacement
    so the breadcrumb survives the running -> terminal transition.
    """
    runs_dir = _harness(root) / "missions" / mission_id / "runs"
    runs_dir.mkdir(parents=True, exist_ok=True)
    index_path = runs_dir / "index.json"
    current: dict[str, Any]
    try:
        current = json.loads(index_path.read_text(encoding="utf-8"))
        if not isinstance(current, dict) or not isinstance(current.get("runs"), list):
            current = {"schema_version": "uh.runs-index.v0", "runs": []}
    except (OSError, ValueError):
        current = {"schema_version": "uh.runs-index.v0", "runs": []}
    runs = current["runs"]
    idx = next(
        (i for i, r in enumerate(runs) if isinstance(r, dict) and r.get("run_id") == entry["run_id"]),
        -1,
    )
    if idx >= 0:
        merged = {**runs[idx], **entry}
        runs[idx] = merged
    else:
        runs.append(entry)
    # Suffix the tmp path with a random nibble: matches the
    # concurrent-writer protection in run-id.ts (Codex P1 PR #96).
    tmp = index_path.with_name(f"index.json.{uuid.uuid4().hex[:6]}.tmp")
    tmp.write_text(json.dumps(current, indent=2), encoding="utf-8")
    tmp.replace(index_path)


@router.get("/missions/{mission_id}/runs/{run_id}/{kind}")
async def get_run_artifact(mission_id: str, run_id: str, kind: str) -> dict[str, Any]:
    _safe_id(mission_id, "mission_id")
    _safe_id(run_id, "run_id")
    filename = _ARTIFACT_KIND_TO_FILE.get(kind)
    if filename is None:
        raise _err(400, "unknown_kind", f"unknown artifact kind {kind}")
    # UH-82: adapters now write per-run artifact directories under
    # `runs/<run_id>/`. Serve the requested run's file directly with the
    # same symlink/bounds guard as `_artifact_response`.
    root = _project_root()
    run_dir = _harness(root) / "missions" / mission_id / "runs" / run_id
    if not run_dir.is_dir():
        # UH-90: distinguish "pruned by retention policy" (we still have an
        # archived entry in runs/index.json) from "never existed" so the
        # frontend can render a tailored placeholder instead of a generic
        # 404. Both still surface as HTTP 404 — the discriminator is the
        # error `code`.
        if _run_is_archived(root, mission_id, run_id):
            raise _err(
                404,
                "archived",
                f"run {run_id} artifacts were pruned by the retention policy",
            )
        raise _err(404, "not_found", f"run {run_id} not found for mission {mission_id}")
    payload = _artifact_response_at(run_dir, filename)
    payload["requested_run_id"] = run_id
    payload["served_run_id"] = run_id
    payload["is_run_scoped"] = True
    return payload


_ARTIFACT_KIND_TO_FILE = {
    "prompt": "prompt.md",
    "final-message": "runtime-final.txt",
    "diff": "diff.patch",
    "result": "runtime-result.yaml",
    "events": "events.ndjson",
}


# ---- workflows + verification (UH-66) --------------------------------------


_SAFE_WORKFLOW_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")


@router.get("/workflows")
async def list_workflows() -> dict[str, list[dict[str, Any]]]:
    root = _project_root()
    workflows_dir = _harness(root) / "workflows"
    if not workflows_dir.is_dir():
        return {"workflows": []}
    items: list[dict[str, Any]] = []
    for path in sorted(workflows_dir.glob("*.yaml")):
        doc = _read_yaml(path) or {}
        items.append({
            # Codex P2 round 11: list must return the file slug as `name`
            # because /workflows/{name} resolves <name>.yaml. Returning
            # doc.get('name') (the display name) broke list->detail
            # round-trips for display names with spaces/`&`. Expose the
            # display name as `displayName` so the UI can still render it.
            "name": path.stem,
            "displayName": str(doc.get("name") or path.stem),
            "description": str(doc.get("description") or ""),
            "phases": len(doc.get("phases") or []),
        })
    return {"workflows": items}


@router.get("/workflows/{name}")
async def get_workflow(name: str) -> dict[str, Any]:
    if not _SAFE_WORKFLOW_NAME.match(name):
        raise _err(400, "invalid_name", "invalid workflow name")
    root = _project_root()
    path = _harness(root) / "workflows" / f"{name}.yaml"
    if not path.is_file():
        raise _err(404, "not_found", f"workflow {name} not found")
    raw = path.read_text(encoding="utf-8")
    # Codex P2: malformed YAML or non-mapping shape must surface as a
    # structured 400 error, not a generic 500.
    try:
        doc = yaml.safe_load(raw) or {}
    except yaml.YAMLError as exc:
        raise _err(400, "malformed_yaml", "malformed workflow yaml", details=str(exc)) from exc
    if not isinstance(doc, dict):
        raise _err(400, "malformed_yaml", "workflow yaml is not a mapping")
    phases = []
    for p in (doc.get("phases") or []):
        if not isinstance(p, dict):
            continue
        phases.append({
            "name": str(p.get("name") or ""),
            "agent_role": str(p.get("agent_role") or ""),
            "description": str(p.get("description") or ""),
            "outputs": [str(o) for o in (p.get("outputs") or [])],
        })
    return {
        "name": str(doc.get("name") or name),
        "description": str(doc.get("description") or ""),
        "phases": len(phases),
        "phases_list": phases,
        "raw": raw,
    }


@router.put("/workflows/{name}")
async def update_workflow(name: str, request: Request) -> dict[str, Any]:
    if not _SAFE_WORKFLOW_NAME.match(name):
        raise _err(400, "invalid_name", "invalid workflow name")
    body = await _json_body(request)
    raw = body.get("raw")
    if not isinstance(raw, str) or len(raw) > _MAX_ARTIFACT_BYTES:
        raise _err(400, "invalid_body", "raw must be a string under the size cap")
    # Validate it parses + has required keys before writing.
    try:
        parsed = yaml.safe_load(raw)
    except yaml.YAMLError as exc:
        raise _err(400, "yaml_parse", f"invalid YAML: {exc}",
                   fields={"raw": str(exc)}) from exc
    if not isinstance(parsed, dict) or "phases" not in parsed:
        raise _err(400, "schema", "workflow must be a mapping with 'phases'",
                   fields={"raw": "missing 'phases'"})
    root = _project_root()
    workflows_dir = _harness(root) / "workflows"
    workflows_dir.mkdir(parents=True, exist_ok=True)
    target = workflows_dir / f"{name}.yaml"
    # Resolve to ensure we don't write outside workflows_dir.
    if target.resolve().parent != workflows_dir.resolve():
        raise _err(400, "invalid_name", "name escapes workflows directory")
    target.write_text(raw, encoding="utf-8")
    return {"ok": True, "path": str(target.relative_to(root))}


@router.get("/missions/{mission_id}/verification")
async def get_verification(mission_id: str) -> dict[str, Any]:
    _safe_id(mission_id, "mission_id")
    root = _project_root()
    path = _harness(root) / "missions" / mission_id / "verification.yaml"
    if not path.is_file():
        raise _err(404, "not_found", "verification.yaml not produced yet")
    raw = path.read_text(encoding="utf-8")
    # Codex P2 sibling: same guard for verification.yaml shape.
    try:
        doc = yaml.safe_load(raw) or {}
    except yaml.YAMLError as exc:
        raise _err(400, "malformed_yaml", "malformed verification yaml", details=str(exc)) from exc
    if not isinstance(doc, dict):
        raise _err(400, "malformed_yaml", "verification yaml is not a mapping")
    acceptance = []
    for ac in (doc.get("acceptance_criteria") or []):
        if not isinstance(ac, dict):
            continue
        acceptance.append({
            "id": str(ac.get("id") or ""),
            "description": str(ac.get("description") or ""),
            "status": str(ac.get("status") or "unknown"),
            "severity": ac.get("severity"),
        })
    return {
        "status": str(doc.get("status") or "unknown"),
        "checks_passed": int(doc.get("checks_passed") or 0),
        "checks_failed": int(doc.get("checks_failed") or 0),
        "checks_blocked": int(doc.get("checks_blocked") or 0),
        "acceptance": acceptance,
        "runtime_config": doc.get("runtime_config") or {},
        "raw": raw,
    }


# ---- mission wizard (UH-67) ------------------------------------------------


@router.post("/missions")
async def create_mission(request: Request) -> dict[str, Any]:
    body = await _json_body(request)
    mission_id = body.get("id")
    if not isinstance(mission_id, str) or not _SAFE_ID_RE.match(mission_id):
        raise _err(400, "invalid_id", "id must be slug-like ([A-Za-z0-9._-])",
                   fields={"id": "must match ^[A-Za-z0-9][A-Za-z0-9._-]+$"})
    name = body.get("name")
    if not isinstance(name, str) or not name.strip():
        raise _err(400, "invalid_name", "name is required",
                   fields={"name": "required"})
    workflow_profile = body.get("workflow_profile")
    if not isinstance(workflow_profile, str) or not workflow_profile.strip():
        raise _err(400, "invalid_workflow", "workflow_profile is required",
                   fields={"workflow_profile": "required"})

    root = _project_root()
    mission_dir = _harness(root) / "missions" / mission_id
    if mission_dir.exists():
        raise _err(409, "exists", f"mission {mission_id} already exists",
                   fields={"id": "already in use"})

    # Resolve to ensure we don't write outside the missions parent.
    resolved = mission_dir.resolve()
    if resolved.parent != (_harness(root) / "missions").resolve():
        raise _err(400, "invalid_id", "id escapes missions directory",
                   fields={"id": "invalid"})

    doc: dict[str, Any] = {
        "schema_version": "uh.mission.v0",
        "id": mission_id,
        "name": name,
        "workflow_profile": workflow_profile,
    }
    if body.get("objective"):
        doc["objective"] = body["objective"]
    if body.get("acceptance_criteria"):
        doc["acceptance_criteria"] = body["acceptance_criteria"]

    mission_dir.mkdir(parents=True)
    (mission_dir / "mission.yaml").write_text(
        yaml.safe_dump(doc, sort_keys=False), encoding="utf-8",
    )
    return {"ok": True, "id": mission_id}


# ---------------------------------------------------------------------------
# Shared helpers.
# ---------------------------------------------------------------------------


async def _json_body(request: Request) -> dict[str, Any]:
    try:
        body = await request.json()
    except json.JSONDecodeError as exc:
        raise _err(400, "invalid_json", f"body is not valid JSON: {exc}") from exc
    if not isinstance(body, dict):
        raise _err(400, "invalid_body", "body must be a JSON object")
    return body


# ---------------------------------------------------------------------------
# Error renderer — unify HTTPException detail dicts to ``{error, code, ...}``.
# ---------------------------------------------------------------------------


def _error_payload(exc: HTTPException) -> dict[str, Any]:
    detail = exc.detail
    if isinstance(detail, dict) and "error" in detail and "code" in detail:
        return detail
    return {"error": str(detail), "code": "http_error"}


def error_handler(request: Request, exc: HTTPException) -> JSONResponse:  # pragma: no cover — wired by app factory.
    return JSONResponse(status_code=exc.status_code, content=_error_payload(exc))


__all__ = [
    "router",
    "set_runner",
    "get_runner",
    "_UhCliRunner",
    "_make_run_id",
    "_SAFE_ID_RE",
]
