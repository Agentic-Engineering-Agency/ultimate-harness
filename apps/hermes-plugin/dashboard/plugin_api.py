"""Placeholder FastAPI router for the UH dashboard plugin (UH-61).

The real backend ships in UH-62 — endpoints for status, missions, runs, SSE
event tail, artifact drilldown, workflows, verification, wizard. For now we
mount an empty router so the dashboard's plugin-loader can wire up the
``api`` field without error.
"""
from fastapi import APIRouter

router = APIRouter()


@router.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok", "slice": "UH-61"}
