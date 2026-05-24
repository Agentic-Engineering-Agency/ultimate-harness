"""UH-104 backend coverage for the adapter-capabilities + cost-forecast
endpoints. Both shell out to the `uh` CLI via the runner, so we stub the
runner's `run_sync` and assert request shaping + response/JSON handling."""
from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest


@pytest.mark.asyncio
async def test_capabilities_happy_path(
    client: httpx.AsyncClient, fake_cli: FakeUhCli, isolated_project: Path,
) -> None:
    payload = {"adapters": [{"id": "hermes", "cost_class": "standard", "max_context_tokens": 200000}]}
    fake_cli.stub(("adapter", "capabilities", "--json"), stdout=json.dumps(payload))
    resp = await client.get("/api/plugins/uh/adapters/capabilities")
    assert resp.status_code == 200, resp.text
    assert resp.json() == payload
    assert fake_cli.calls[-1]["args"] == ["adapter", "capabilities", "--json"]


@pytest.mark.asyncio
async def test_capabilities_cli_error(
    client: httpx.AsyncClient, fake_cli: FakeUhCli, isolated_project: Path,
) -> None:
    fake_cli.stub(("adapter", "capabilities", "--json"), stdout="", returncode=1)
    resp = await client.get("/api/plugins/uh/adapters/capabilities")
    assert resp.status_code == 500, resp.text
    assert resp.json()["code"] == "uh_cli_error"


@pytest.mark.asyncio
async def test_capabilities_bad_json(
    client: httpx.AsyncClient, fake_cli: FakeUhCli, isolated_project: Path,
) -> None:
    fake_cli.stub(("adapter", "capabilities", "--json"), stdout="not json")
    resp = await client.get("/api/plugins/uh/adapters/capabilities")
    assert resp.status_code == 500, resp.text
    assert resp.json()["code"] == "bad_json"


@pytest.mark.asyncio
async def test_cost_forecast_happy_path(
    client: httpx.AsyncClient, fake_cli: FakeUhCli, isolated_project: Path,
) -> None:
    forecast = {
        "adapter": "hermes",
        "cost_class": "standard",
        "est_input_tokens": 200,
        "est_output_tokens": 100,
        "est_cost_usd": 0.0021,
        "basis": "history",
        "runs_sampled": 2,
    }
    fake_cli.stub(
        ("adapter", "cost-forecast", "--mission", "demo", "--adapter", "auto", "--json"),
        stdout=json.dumps(forecast),
    )
    resp = await client.post("/api/plugins/uh/missions/demo/cost-forecast", json={})
    assert resp.status_code == 200, resp.text
    assert resp.json() == forecast


@pytest.mark.asyncio
async def test_cost_forecast_explicit_adapter(
    client: httpx.AsyncClient, fake_cli: FakeUhCli, isolated_project: Path,
) -> None:
    fake_cli.stub(
        ("adapter", "cost-forecast", "--mission", "demo", "--adapter", "codex", "--json"),
        stdout=json.dumps({"adapter": "codex", "basis": "heuristic", "runs_sampled": 0}),
    )
    resp = await client.post("/api/plugins/uh/missions/demo/cost-forecast", json={"adapter": "codex"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["adapter"] == "codex"


@pytest.mark.asyncio
async def test_cost_forecast_rejects_bad_adapter(
    client: httpx.AsyncClient, fake_cli: FakeUhCli, isolated_project: Path,
) -> None:
    resp = await client.post("/api/plugins/uh/missions/demo/cost-forecast", json={"adapter": "BAD!!"})
    assert resp.status_code == 400, resp.text
    assert resp.json()["code"] == "invalid_adapter"
    # No CLI call should have been made for an invalid adapter.
    assert not any("cost-forecast" in c.get("args", []) for c in fake_cli.calls)


@pytest.mark.asyncio
async def test_cost_forecast_cli_failure(
    client: httpx.AsyncClient, fake_cli: FakeUhCli, isolated_project: Path,
) -> None:
    fake_cli.stub(
        ("adapter", "cost-forecast", "--mission", "demo", "--adapter", "auto", "--json"),
        stdout="",
        returncode=1,
    )
    resp = await client.post("/api/plugins/uh/missions/demo/cost-forecast", json={})
    assert resp.status_code == 400, resp.text
    assert resp.json()["code"] == "forecast_failed"
