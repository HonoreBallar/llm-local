"""API du veilleur + service de l'interface web (dossier static/)."""
from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock

from fastapi import FastAPI, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import llm, store
from .analyse import compute_findings, compute_stats, overall
from .collect import snapshot

app = FastAPI(title="Veilleur", docs_url=None, redoc_url=None)

# Lire les logs de tous les conteneurs coûte ~1 s : on garde le résultat quelques secondes.
CACHE_TTL = 15
_cache: dict[float, tuple[float, list[dict], list]] = {}
_lock = Lock()


def _snapshot(hours: float):
    with _lock:
        hit = _cache.get(hours)
        if hit and time.monotonic() - hit[0] < CACHE_TTL:
            return hit[1], hit[2]
    containers, events = snapshot(hours)
    with _lock:
        _cache[hours] = (time.monotonic(), containers, events)
    return containers, events


def _overview(hours: float) -> dict:
    containers, events = _snapshot(hours)
    now = datetime.now(timezone.utc)
    stats = compute_stats(containers, events, hours, now)
    findings = compute_findings(containers, stats)
    return {
        "generated_at": now.isoformat(),
        "verdict": overall(findings),
        "containers": containers,
        "stats": stats,
        "findings": findings,
    }


Hours = Query(24, gt=0, le=168)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/overview")
def overview(hours: float = Hours):
    try:
        return _overview(hours)
    except Exception as exc:  # Docker injoignable, etc.
        raise HTTPException(503, f"Impossible de lire Docker : {exc}") from exc


@app.get("/api/logs")
def logs(
    hours: float = Hours,
    service: str | None = None,
    level: str | None = Query(None, pattern="^(info|warn|error)$"),
    q: str | None = Query(None, max_length=200),
    noise: bool = False,
    limit: int = Query(400, gt=0, le=5000),
):
    try:
        _, events = _snapshot(hours)
    except Exception as exc:
        raise HTTPException(503, f"Impossible de lire Docker : {exc}") from exc
    rank = {"info": 0, "warn": 1, "error": 2}
    needle = q.lower() if q else None
    out = []
    for e in reversed(events):
        if not noise and e.noise:
            continue
        if service and e.service != service:
            continue
        if level and rank[e.level] < rank[level]:
            continue
        if needle and needle not in e.text.lower():
            continue
        out.append(e.to_dict())
        if len(out) >= limit:
            break
    return {"events": out, "total_lines": len(events)}


class ReportRequest(BaseModel):
    hours: float = Field(24, gt=0, le=168)


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


@app.post("/api/report")
async def report(req: ReportRequest):
    """Flux SSE : meta (constats) -> delta… (texte du LLM) -> done (fidélité, performance) | error."""
    try:
        data = await run_in_threadpool(_overview, req.hours)
    except Exception as exc:
        raise HTTPException(503, f"Impossible de lire Docker : {exc}") from exc

    facts = llm.build_facts(data["stats"], data["findings"])
    messages = llm.build_messages(facts, data["verdict"])

    async def events():
        yield _sse({"type": "meta", "verdict": data["verdict"], "findings": data["findings"], "facts": facts})
        started = time.monotonic()
        first = None
        text, usage = [], None
        try:
            async for chunk in llm.stream_report(messages):
                if "delta" in chunk:
                    if first is None:
                        first = time.monotonic() - started
                    text.append(chunk["delta"])
                    yield _sse({"type": "delta", "text": chunk["delta"]})
                elif "usage" in chunk:
                    usage = chunk["usage"]
        except Exception as exc:
            yield _sse({"type": "error", "message": str(exc)})
            return

        full = "".join(text).strip()
        total = time.monotonic() - started
        out_tokens = (usage or {}).get("completion_tokens")
        gen_time = total - (first or 0)
        perf = {
            "first_token_s": round(first, 1) if first is not None else None,
            "total_s": round(total, 1),
            "completion_tokens": out_tokens,
            "tokens_per_s": round(out_tokens / gen_time, 2) if out_tokens and gen_time > 0 else None,
        }
        fidelity = llm.check_fidelity(full, facts, data["verdict"])
        now = datetime.now(timezone.utc)
        saved = {
            "id": now.strftime("%Y%m%dT%H%M%S"),
            "created_at": now.isoformat(),
            "window_hours": req.hours,
            "verdict": data["verdict"],
            "findings": data["findings"],
            "facts": facts,
            "text": full,
            "fidelity": fidelity,
            "perf": perf,
        }
        store.save(saved)
        yield _sse({"type": "done", "id": saved["id"], "fidelity": fidelity, "perf": perf})

    return StreamingResponse(events(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.get("/api/reports")
def reports():
    return store.list_reports()


@app.get("/api/reports/{report_id}")
def report_detail(report_id: str):
    r = store.get(report_id)
    if not r:
        raise HTTPException(404, "Rapport introuvable")
    return r


STATIC = Path(__file__).resolve().parent.parent / "static"
if STATIC.exists():
    app.mount("/", StaticFiles(directory=STATIC, html=True), name="web")
