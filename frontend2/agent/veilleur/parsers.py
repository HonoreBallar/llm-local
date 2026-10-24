"""Transforme les lignes brutes des conteneurs en événements structurés.

Chaque ligne arrive préfixée par l'horodatage Docker (option timestamps=True).
Le format du reste dépend du logiciel : Ollama (Go/GIN + llama.cpp), LiteLLM (uvicorn),
nginx (frontend1) et Caddy (VPS, format console ou JSON).
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone

ANSI = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")


@dataclass
class Event:
    ts: datetime
    service: str
    text: str
    level: str = "info"  # info | warn | error
    kind: str = "other"  # http | timing | load | progress | other
    noise: bool = False  # sondes de santé, progression… masquées par défaut
    method: str | None = None
    path: str | None = None
    status: int | None = None
    client: str | None = None
    duration_ms: float | None = None
    data: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "ts": self.ts.isoformat(),
            "service": self.service,
            "level": self.level,
            "kind": self.kind,
            "noise": self.noise,
            "text": self.text[:1000],
        }


# ---------- Outils ----------

def parse_docker_ts(stamp: str) -> datetime:
    """2026-10-20T14:22:32.123456789Z -> datetime UTC (Python ne garde que les microsecondes)."""
    s = stamp.rstrip("Z")
    if "." in s:
        head, frac = s.split(".", 1)
        s = f"{head}.{frac[:6]}"
    return datetime.fromisoformat(s).replace(tzinfo=timezone.utc)


GO_DURATION = re.compile(r"(\d+(?:\.\d+)?)(h|ms|µs|μs|us|ns|m|s)")
GO_UNIT_MS = {"h": 3_600_000, "m": 60_000, "s": 1000, "ms": 1, "µs": 1e-3, "μs": 1e-3, "us": 1e-3, "ns": 1e-6}


def parse_go_duration(text: str) -> float | None:
    """« 3m3s », « 1.39ms », « 48.4µs » -> millisecondes."""
    parts = GO_DURATION.findall(text)
    if not parts:
        return None
    return sum(float(v) * GO_UNIT_MS[u] for v, u in parts)


ERROR_WORDS = re.compile(
    r"\b(error|erreur|exception|traceback|panic|fatal|critical|out of memory|oom-?kill\w*|segmentation fault)\b", re.I
)
WARN_WORDS = re.compile(r"\b(warn|warning|deprecated|timed out|timeout)\b", re.I)


def guess_level(text: str) -> str:
    if ERROR_WORDS.search(text):
        return "error"
    if WARN_WORDS.search(text):
        return "warn"
    return "info"


def level_from_status(status: int) -> str:
    if status >= 500:
        return "error"
    if status >= 400:
        return "warn"
    return "info"


def normalize_level(word: str) -> str:
    w = word.lower()
    if w.startswith(("err", "crit", "fatal", "panic", "emerg", "alert")):
        return "error"
    if w.startswith("warn"):
        return "warn"
    return "info"


# ---------- Ollama ----------

GIN = re.compile(r'^\[GIN\] [^|]+\|\s*(\d{3}) \|\s*(\S+) \|\s*(\S+) \|\s*(\w+)\s+"([^"]*)"')
TIMING = re.compile(r"\|\s*(prompt eval|eval|total) time =\s*([\d.]+) ms /\s*(\d+) tokens")
GO_LEVEL = re.compile(r"\blevel=(\w+)")
GO_TIME = re.compile(r"^time=(\S+)")
RUNNER_STARTED = re.compile(r"(?:runner|llama-server) started in ([\d.]+) seconds")
LLAMA_INTERNAL = ("load", "llama_", "print_info", "srv ", "slot ", "clip_", "init", "common_", "ggml_",
                  "sched_", "graph_", "build_", "kv_", "context", "set_", "main:", "system_info", "que ")
OLLAMA_NOISE_PATHS ={"/", "/api/tags", "/api/version", "/api/ps"}


def parse_ollama(ev: Event) -> None:
    t = ev.text
    if m := GIN.match(t):
        ev.kind = "http"
        ev.status = int(m.group(1))
        ev.duration_ms = parse_go_duration(m.group(2))
        ev.client = m.group(3)
        ev.method = m.group(4)
        ev.path = m.group(5)
        ev.level = level_from_status(ev.status)
        ev.noise = ev.path in OLLAMA_NOISE_PATHS
        return
    if m := TIMING.search(t):
        phase = {"prompt eval": "prompt", "eval": "eval", "total": "total"}[m.group(1)]
        ev.kind = "timing"
        ev.data = {"phase": phase, "ms": float(m.group(2)), "tokens": int(m.group(3))}
        return
    if "n_gen =" in t or "print_timing" in t or "graphs reused" in t or "graph reallocs" in t:
        ev.kind, ev.noise = "progress", True
        return
    if 'msg="loading model' in t or "msg=\"starting llama server\"" in t:
        ev.kind, ev.data = "load", {"phase": "start"}
    elif 'msg="loaded runners"' in t:
        ev.kind, ev.data = "load", {"phase": "end"}
    elif m := RUNNER_STARTED.search(t):
        ev.kind, ev.data = "load", {"phase": "end", "seconds": float(m.group(1))}

    if m := GO_TIME.match(t):
        try:
            ev.ts = datetime.fromisoformat(m.group(1))
        except ValueError:
            pass
    if m := GO_LEVEL.search(t):
        ev.level = normalize_level(m.group(1))
    elif not t.startswith(LLAMA_INTERNAL) and not t[:1].isspace():
        ev.level = guess_level(t)
    elif "out of memory" in t.lower() or "failed" in t.lower():
        ev.level = "error"
    else:
        # Détails internes de llama.cpp (slots, tenseurs, échantillonneur…) : utiles au débogage seulement.
        ev.noise = ev.kind == "other"


# ---------- LiteLLM (uvicorn) ----------

UVICORN = re.compile(r'^(INFO|WARNING|ERROR|CRITICAL):\s+(\S+?):\d+ - "(\w+) (\S+) HTTP/[\d.]+" (\d{3})')
UVICORN_LEVEL = re.compile(r"^(INFO|WARNING|ERROR|CRITICAL|DEBUG):")
GATEWAY_NOISE_PATHS = ("/health", "/v1/models", "/models")


def parse_gateway(ev: Event) -> None:
    t = ev.text
    if m := UVICORN.match(t):
        ev.kind = "http"
        ev.client = m.group(2)
        ev.method = m.group(3)
        ev.path = m.group(4).split("?", 1)[0]
        ev.status = int(m.group(5))
        ev.level = level_from_status(ev.status)
        ev.noise = ev.method == "GET" and ev.path.startswith(GATEWAY_NOISE_PATHS)
        return
    if "was missed by" in t:
        # Tâche interne de LiteLLM en retard : signe que le CPU est saturé par une génération.
        ev.data = {"cpu_busy": True}
        ev.noise = True
        return
    if not t.strip() or "Give Feedback" in t or "github.com/BerriAI" in t:
        ev.noise = True
        return
    if m := UVICORN_LEVEL.match(t):
        ev.level = normalize_level(m.group(1))
    else:
        ev.level = guess_level(t)


# ---------- nginx (frontend1) ----------

NGINX_ACCESS = re.compile(r'^(\S+) - \S+ \[[^\]]+\] "(\w+) (\S+) [^"]*" (\d{3}) ')
NGINX_ERROR = re.compile(r"^\d{4}/\d\d/\d\d \d\d:\d\d:\d\d \[(\w+)\]")


def parse_nginx(ev: Event) -> None:
    t = ev.text
    if m := NGINX_ACCESS.match(t):
        ev.kind = "http"
        ev.client = m.group(1)
        ev.method = m.group(2)
        ev.path = m.group(3).split("?", 1)[0]
        ev.status = int(m.group(4))
        ev.level = level_from_status(ev.status)
        ev.noise = ev.method == "GET" and ("/health" in ev.path or ev.path.endswith("/v1/models"))
        return
    if m := NGINX_ERROR.match(t):
        ev.level = normalize_level(m.group(1))
        return
    ev.level = "info" if t.startswith(("/docker-entrypoint", "10-listen", "20-envsubst")) else guess_level(t)


# ---------- Caddy (VPS) ----------

def parse_caddy(ev: Event) -> None:
    """Accepte le format « console » (texte + JSON en fin de ligne) et le format JSON pur."""
    t = ev.text
    payload: dict = {}
    start = t.find("{")
    if start != -1:
        try:
            payload = json.loads(t[start:])
        except ValueError:
            payload = {}
    level = payload.get("level")
    if not level:
        cols = t.split("\t")
        level = cols[1] if len(cols) > 1 else None
    ev.level = normalize_level(level) if level else guess_level(t)

    req = payload.get("request")
    if isinstance(req, dict) and "status" in payload:
        ev.kind = "http"
        ev.method = req.get("method")
        ev.path = str(req.get("uri", "")).split("?", 1)[0]
        ev.client = req.get("client_ip") or req.get("remote_ip")
        ev.status = int(payload["status"])
        if isinstance(payload.get("duration"), (int, float)):
            ev.duration_ms = payload["duration"] * 1000
        ev.level = level_from_status(ev.status)
        ev.noise = ev.path.startswith("/health")


def parse_generic(ev: Event) -> None:
    ev.level = guess_level(ev.text)


def parser_for(image: str):
    img = image.lower()
    if "ollama" in img:
        return parse_ollama
    if "litellm" in img:
        return parse_gateway
    if "caddy" in img:
        return parse_caddy
    if "nginx" in img or "frontend" in img:
        return parse_nginx
    return parse_generic


def parse_lines(raw: str, service: str, image: str) -> list[Event]:
    parse = parser_for(image)
    events: list[Event] = []
    for line in raw.splitlines():
        stamp, _, rest = line.partition(" ")
        try:
            ts = parse_docker_ts(stamp)
        except ValueError:
            continue
        text = ANSI.sub("", rest).rstrip()
        ev = Event(ts=ts, service=service, text=text)
        if not text.strip():
            ev.noise = True
        else:
            parse(ev)
        events.append(ev)
    return events
