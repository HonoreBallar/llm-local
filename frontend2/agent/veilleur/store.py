"""Historique des rapports : un fichier JSON par rapport dans /data/reports."""
from __future__ import annotations

import json
import os
from pathlib import Path

DIR = Path(os.environ.get("DATA_DIR", "/data")) / "reports"
KEEP = 100


def save(report: dict) -> None:
    DIR.mkdir(parents=True, exist_ok=True)
    (DIR / f"{report['id']}.json").write_text(json.dumps(report, ensure_ascii=False), encoding="utf-8")
    for old in sorted(DIR.glob("*.json"))[:-KEEP]:
        old.unlink(missing_ok=True)


def list_reports(limit: int = 30) -> list[dict]:
    if not DIR.exists():
        return []
    out = []
    for path in sorted(DIR.glob("*.json"), reverse=True)[:limit]:
        try:
            r = json.loads(path.read_text(encoding="utf-8"))
        except ValueError:
            continue
        out.append({k: r.get(k) for k in ("id", "created_at", "window_hours", "verdict", "fidelity", "perf")})
    return out


def get(report_id: str) -> dict | None:
    if not report_id.replace("-", "").replace("T", "").isalnum():
        return None
    path = DIR / f"{report_id}.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None
