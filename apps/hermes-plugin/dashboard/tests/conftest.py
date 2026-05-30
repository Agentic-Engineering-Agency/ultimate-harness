"""Pytest fixtures for the Hermes dashboard plugin backend.

* Adds ``apps/hermes-plugin/dashboard`` to ``sys.path`` so ``plugin_api`` imports cleanly.
* Provides a ``FastAPI`` app + ``httpx.AsyncClient`` fixture pair.
* Provides a ``FakeUhCli`` runner that records argv and returns canned output.
* Provides an ``isolated_project`` fixture that scaffolds a minimal ``.harness/``
  tree in a ``tmp_path`` and sets ``$UH_PROJECT_ROOT`` accordingly.
"""
from __future__ import annotations

import asyncio
import os
import subprocess
import sys
from collections.abc import AsyncIterator, Iterator
from pathlib import Path
from typing import Any, Optional

import httpx
import pytest
import pytest_asyncio
import yaml
from fastapi import FastAPI, HTTPException

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import plugin_api  # noqa: E402


# ---------------------------------------------------------------------------
# FakeUhCli — records argv and returns canned subprocess.CompletedProcess.
# ---------------------------------------------------------------------------


class FakeCompletedProcess:
    def __init__(self, stdout: str = "", stderr: str = "", returncode: int = 0) -> None:
        self.stdout = stdout
        self.stderr = stderr
        self.returncode = returncode


class FakePopen:
    def __init__(self, *, returncode: int = 0, events_path: Optional[Path] = None,
                 events_to_append: Optional[list[str]] = None) -> None:
        self._returncode = returncode
        self.terminated = False
        self._exited = False
        self.events_path = events_path
        self.events_to_append = list(events_to_append or [])
        self._appended = False

    def poll(self) -> Optional[int]:
        # Append staged events on first poll so the SSE generator picks them
        # up; this simulates the CLI writing to events.ndjson mid-stream.
        if not self._appended and self.events_path is not None and self.events_to_append:
            self.events_path.parent.mkdir(parents=True, exist_ok=True)
            with self.events_path.open("a", encoding="utf-8") as fh:
                for line in self.events_to_append:
                    fh.write(line + "\n")
            self._appended = True
        return self._returncode if self._exited else None

    def schedule_exit(self) -> None:
        """Mark the process as exited so the next poll() returns its code."""
        self._exited = True

    def terminate(self) -> None:
        self.terminated = True
        self.schedule_exit()


class FakeUhCli(plugin_api._UhCliRunner):
    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []
        self.stdout_for: dict[tuple[str, ...], str] = {}
        self.returncode_for: dict[tuple[str, ...], int] = {}
        self.last_popen: Optional[FakePopen] = None
        self.popen_returncode: int = 0
        self.popen_events_path: Optional[Path] = None
        self.popen_events: list[str] = []

    def stub(self, args: tuple[str, ...], *, stdout: str = "", returncode: int = 0) -> None:
        self.stdout_for[args] = stdout
        self.returncode_for[args] = returncode

    def run_sync(self, args: list[str], cwd: Path, *, timeout: float) -> Any:  # type: ignore[override]
        key = tuple(args)
        self.calls.append({"args": list(args), "cwd": str(cwd), "timeout": timeout})
        return FakeCompletedProcess(
            stdout=self.stdout_for.get(key, ""),
            stderr="",
            returncode=self.returncode_for.get(key, 0),
        )

    def spawn(self, args: list[str], cwd: Path) -> Any:  # type: ignore[override]
        self.calls.append({"args": list(args), "cwd": str(cwd), "spawn": True})
        # UH-82: per-run artifact directories live under
        # `.harness/missions/<id>/runs/<run_id>/events.ndjson`. When tests
        # don't pin `popen_events_path` explicitly, derive it from the
        # spawn argv so FakePopen writes events to the same file the
        # plugin's start_run is watching.
        events_path = self.popen_events_path
        if events_path is None:
            events_path = _derive_per_run_events_path(args, cwd)
        self.last_popen = FakePopen(
            returncode=self.popen_returncode,
            events_path=events_path,
            events_to_append=self.popen_events,
        )
        return self.last_popen


def _derive_per_run_events_path(args: list[str], cwd: Path) -> Optional[Path]:
    """Inspect ``uh mission run --root X --run-id Y <mission.yaml>`` argv
    to compute the per-run events path the CLI would write to. Returns
    None when the argv shape doesn't match."""
    try:
        root_idx = args.index("--root")
        run_id_idx = args.index("--run-id")
    except ValueError:
        return None
    root = Path(args[root_idx + 1])
    run_id = args[run_id_idx + 1]
    mission_yaml = next((a for a in args if a.endswith("mission.yaml")), None)
    if mission_yaml is None:
        return None
    mission_id = Path(mission_yaml).parent.name
    return root / ".harness" / "missions" / mission_id / "runs" / run_id / "events.ndjson"


# ---------------------------------------------------------------------------
# Isolated project fixture.
# ---------------------------------------------------------------------------


@pytest.fixture()
def isolated_project(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Scaffold a `.harness/` tree under tmp_path and point UH_PROJECT_ROOT at it."""
    root = tmp_path
    harness = root / ".harness"
    (harness / "adapters").mkdir(parents=True)
    (harness / "workflows").mkdir(parents=True)
    (harness / "missions").mkdir(parents=True)
    (harness / "sandboxes").mkdir(parents=True)
    (harness / "audit").mkdir(parents=True)

    # Minimal project.yaml
    (harness / "project.yaml").write_text(
        "schema_version: uh.project.v0\nname: testproj\n", encoding="utf-8",
    )
    # One adapter
    (harness / "adapters" / "hermes.yaml").write_text(
        yaml.safe_dump({
            "schema_version": "uh.adapter.v0",
            "id": "hermes",
            "runtime": "hermes",
            "status": "active",
        }),
        encoding="utf-8",
    )
    # One workflow
    (harness / "workflows" / "research-docs.yaml").write_text(
        yaml.safe_dump({
            "schema_version": "uh.workflow.v0",
            "id": "research-docs",
            "name": "Research & Documentation",
            "description": "Stub",
            "phases": [{"name": "research", "agent_role": "researcher", "description": "Look it up"}],
        }),
        encoding="utf-8",
    )
    # One mission
    mission_dir = harness / "missions" / "demo"
    mission_dir.mkdir()
    (mission_dir / "mission.yaml").write_text(
        yaml.safe_dump({
            "schema_version": "uh.mission.v0",
            "id": "demo",
            "name": "Demo",
            "workflow_profile": "research-docs",
            "objective": "Stub objective",
            "acceptance_criteria": [{"id": "ac-1", "description": "did the thing", "severity": "warn"}],
            "expected_artifacts": [{"path": "docs/demo.txt"}],
        }),
        encoding="utf-8",
    )
    monkeypatch.setenv("UH_PROJECT_ROOT", str(root))
    return root


# ---------------------------------------------------------------------------
# App / client / runner.
# ---------------------------------------------------------------------------


@pytest.fixture()
def fake_cli() -> Iterator[FakeUhCli]:
    runner = FakeUhCli()
    previous = plugin_api.get_runner()
    plugin_api.set_runner(runner)
    try:
        yield runner
    finally:
        plugin_api.set_runner(previous)


@pytest.fixture(autouse=True)
def _reset_active_runs() -> Iterator[None]:
    """Codex P1 round 12 follow-up: _active_runs is module-level singleton
    state. Each test's start_run leaves entries with status='running'; the
    new concurrent-run guard would then block subsequent tests. Snapshot
    the registry before each test and restore it after, and cancel any
    background asyncio tasks (watchdog / eviction) the test spawned."""
    prev = dict(plugin_api._active_runs)
    plugin_api._active_runs.clear()
    # ``_active_sse_tails`` is a module-level counter incremented by the SSE
    # generator and decremented in its ``finally``. A few tests intentionally
    # break out of an SSE stream early (e.g. the keepalive test iterates the
    # generator directly and returns on the first keepalive); under
    # httpx.ASGITransport that generator's ``finally`` may run on a later
    # event loop or not at all, leaving the counter at a non-zero baseline.
    # test_disconnect_stops_server_generator then sees that leaked +1 and
    # fails its ``== 0`` assertion even though its own tail closed cleanly.
    # Snapshot + zero the counter per test so the assertion measures only the
    # current test's tails, then restore the prior value on teardown
    # (symmetric with the _active_runs snapshot above).
    prev_sse_tails = plugin_api._active_sse_tails
    plugin_api._active_sse_tails = 0
    try:
        yield
    finally:
        plugin_api._active_sse_tails = prev_sse_tails
        # Cancel any background tasks (watchdog, eviction) the test created
        # so they don't fire after the test exits.
        #
        # Blacksmith CI: this sync fixture's teardown runs *after*
        # pytest-asyncio (pinned 0.24.0) has already closed the test's
        # per-test event loop. Calling ``task.cancel()`` on that closed loop
        # schedules ``loop.call_soon(...)`` and raises
        # ``RuntimeError: Event loop is closed`` — surfacing as 17 teardown
        # ERRORs. Guard each cancel: only touch a task whose loop is still
        # open, and defensively swallow the RuntimeError in case the loop
        # closes between the check and the cancel. Tasks bound to an
        # already-closed loop are orphaned regardless; there is nothing to
        # cancel because the loop that owned them is gone.
        for info in plugin_api._active_runs.values():
            for key in ("watchdog", "eviction"):
                task = info.get(key)
                if task is None or task.done():
                    continue
                try:
                    loop = task.get_loop()
                except RuntimeError:
                    continue
                if loop.is_closed():
                    continue
                try:
                    task.cancel()
                except RuntimeError:
                    # Loop closed between the is_closed() check and cancel().
                    pass
        plugin_api._active_runs.clear()
        plugin_api._active_runs.update(prev)


@pytest.fixture()
def app(fake_cli: FakeUhCli) -> FastAPI:
    application = FastAPI()
    application.include_router(plugin_api.router, prefix="/api/plugins/uh")
    application.add_exception_handler(HTTPException, plugin_api.error_handler)
    return application


@pytest_asyncio.fixture()
async def client(app: FastAPI) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
