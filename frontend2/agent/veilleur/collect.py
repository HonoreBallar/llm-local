"""Lecture seule de Docker : état des conteneurs, mémoire et logs.

L'agent ne parle pas directement au socket Docker : il passe par docker-socket-proxy,
qui n'autorise que les requêtes GET sur /containers (aucun start, stop ni exec possible).
"""
from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

import docker

from .parsers import Event, parse_lines

MAX_LINES = int(os.environ.get("MAX_LINES_PER_CONTAINER", "20000"))
PROJECTS = [p.strip() for p in os.environ.get("WATCH_PROJECTS", "llm-local").split(",") if p.strip()]
EXCLUDED = {s.strip() for s in os.environ.get("WATCH_EXCLUDE_SERVICES", "socket-proxy").split(",") if s.strip()}


def _client() -> docker.DockerClient:
    return docker.from_env(version="auto", timeout=30)


def _memory(container) -> tuple[int | None, int | None]:
    try:
        st = container.stats(stream=False, one_shot=True)
        mem = st.get("memory_stats") or {}
        usage = mem.get("usage")
        if usage is None:
            return None, None
        # Même calcul que « docker stats » : on retire le cache de fichiers inactif.
        usage -= (mem.get("stats") or {}).get("inactive_file", 0)
        return usage, mem.get("limit")
    except Exception:
        return None, None


def _info(container) -> dict:
    attrs = container.attrs
    state = attrs.get("State", {})
    labels = attrs.get("Config", {}).get("Labels", {}) or {}
    running = state.get("Status") == "running"
    usage, limit = _memory(container) if running else (None, None)
    return {
        "name": container.name,
        "service": labels.get("com.docker.compose.service", container.name),
        "project": labels.get("com.docker.compose.project", ""),
        "image": attrs.get("Config", {}).get("Image", ""),
        "state": state.get("Status", "unknown"),
        "health": (state.get("Health") or {}).get("Status"),
        "restarts": attrs.get("RestartCount", 0),
        "oom_killed": bool(state.get("OOMKilled")),
        "exit_code": state.get("ExitCode"),
        "started_at": state.get("StartedAt"),
        "mem_usage": usage,
        "mem_limit": limit,
    }


def _logs(container, service: str, image: str, since: datetime) -> list[Event]:
    raw = container.logs(stdout=True, stderr=True, timestamps=True, since=int(since.timestamp()), tail=MAX_LINES)
    return parse_lines(raw.decode("utf-8", errors="replace"), service, image)


def snapshot(hours: float) -> tuple[list[dict], list[Event]]:
    """Retourne (conteneurs, événements triés par date) pour la fenêtre demandée."""
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    client = _client()
    try:
        containers = []
        for project in PROJECTS:
            containers += client.containers.list(
                all=True, filters={"label": f"com.docker.compose.project={project}"}
            )
        containers = [
            c for c in containers if c.labels.get("com.docker.compose.service", c.name) not in EXCLUDED
        ]
        with ThreadPoolExecutor(max_workers=8) as pool:
            infos = list(pool.map(_info, containers))
            batches = pool.map(lambda pair: _logs(pair[0], pair[1]["service"], pair[1]["image"], since),
                               zip(containers, infos))
            events = [ev for batch in batches for ev in batch]
    finally:
        client.close()
    events.sort(key=lambda e: e.ts)
    infos.sort(key=lambda i: (i["project"], i["service"]))
    return infos, events
