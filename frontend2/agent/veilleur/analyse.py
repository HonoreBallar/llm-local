"""Compte, regroupe et classe : tout ce qui peut être calculé sans IA est calculé ici.

Le LLM ne reçoit que ce résumé chiffré et les constats déjà classés : il explique,
il ne décide ni de la gravité ni des commandes (pas d'hallucination possible sur ces points).
"""
from __future__ import annotations

import re
from collections import Counter, defaultdict
from datetime import datetime, timedelta

from .parsers import Event

SUSPICIOUS = re.compile(r"(\.env|\.git|wp-|wordpress|\.php|phpmyadmin|/admin|/cgi-bin|/\.aws|/actuator|/vendor)", re.I)
EDGE_IMAGES = ("caddy", "nginx", "frontend")  # services exposés : là où passent les robots
SEVERITY_ORDER = {"urgent": 0, "attention": 1, "info": 2, "ok": 3}


def _avg(values: list[float]) -> float | None:
    return round(sum(values) / len(values), 2) if values else None


def _image_of(service: str, containers: list[dict]) -> str:
    for c in containers:
        if c["service"] == service:
            return c["image"].lower()
    return ""


def compute_stats(containers: list[dict], events: list[Event], hours: float, now: datetime) -> dict:
    services: dict[str, Counter] = defaultdict(Counter)
    for e in events:
        s = services[e.service]
        s["lines"] += 1
        s["noise"] += e.noise
        if e.kind != "http":
            s["errors"] += e.level == "error"
            s["warnings"] += e.level == "warn"

    gateway = {c["service"] for c in containers if "litellm" in c["image"].lower()}
    ollama = {c["service"] for c in containers if "ollama" in c["image"].lower()}
    edge = {c["service"] for c in containers if any(k in c["image"].lower() for k in EDGE_IMAGES)}

    # --- API (vue de la passerelle) ---
    api = [e for e in events if e.service in gateway and e.kind == "http" and not e.noise]
    by_status = Counter(f"{e.status // 100}xx" for e in api)
    api_stats = {
        "requests": len(api),
        "by_status": {k: by_status.get(k, 0) for k in ("2xx", "4xx", "5xx")},
        "unauthorized": sum(e.status in (401, 403) for e in api),
        "top_paths": Counter(e.path for e in api).most_common(5),
        "clients": Counter(e.client for e in api).most_common(5),
    }

    # --- Modèle (vue d'Ollama) ---
    timings = [e for e in events if e.service in ollama and e.kind == "timing"]
    evals = [e.data for e in timings if e.data["phase"] == "eval" and e.data["ms"] > 0]
    prompts = [e.data for e in timings if e.data["phase"] == "prompt" and e.data["ms"] > 0]
    totals = [e.data for e in timings if e.data["phase"] == "total"]
    tps = [d["tokens"] / (d["ms"] / 1000) for d in evals if d["tokens"] > 0]
    chats = [e for e in events if e.service in ollama and e.kind == "http" and e.method == "POST"
             and e.path in ("/api/chat", "/api/generate", "/v1/chat/completions")]
    chat_s = [e.duration_ms / 1000 for e in chats if e.duration_ms is not None]

    loads, load_s, started = 0, [], None
    for e in events:
        if e.service not in ollama or e.kind != "load":
            continue
        if e.data["phase"] == "start":
            started = e.ts
        elif started:  # Ollama annonce la fin plusieurs fois : on ne compte que la première après un début
            loads += 1
            if "seconds" in e.data:
                load_s.append(e.data["seconds"])
            else:
                load_s.append((e.ts - started).total_seconds())
            started = None

    llm_stats = {
        "generations": len(totals),
        "tokens_out": sum(d["tokens"] for d in evals),
        "tokens_in": sum(d["tokens"] for d in prompts),
        "tps_avg": _avg(tps),
        "tps_min": round(min(tps), 2) if tps else None,
        "prompt_tps_avg": _avg([d["tokens"] / (d["ms"] / 1000) for d in prompts if d["tokens"] > 0]),
        "gen_s_avg": _avg([d["ms"] / 1000 for d in totals]),
        "gen_s_max": round(max(d["ms"] for d in totals) / 1000, 1) if totals else None,
        "chat_errors": sum(e.status >= 400 for e in chats),
        "chat_s_max": round(max(chat_s), 1) if chat_s else None,
        "loads": loads,
        "load_s_avg": _avg(load_s),
        "cpu_busy_events": sum(1 for e in events if e.data.get("cpu_busy")),
    }

    # --- Robots qui fouillent (services exposés) ---
    probes: dict[str, list[str]] = defaultdict(list)
    for e in events:
        if e.service in edge and e.kind == "http" and e.status in (400, 401, 403, 404, 405):
            probes[e.client or "?"].append(e.path or "")
    scanners = []
    for ip, paths in probes.items():
        suspicious = [p for p in paths if SUSPICIOUS.search(p)]
        if len(paths) >= 20 or len(suspicious) >= 3:
            scanners.append({"ip": ip, "hits": len(paths),
                             "paths": [p for p, _ in Counter(suspicious or paths).most_common(4)]})
    scanners.sort(key=lambda s: -s["hits"])

    # --- Échantillon d'erreurs (hors HTTP) ---
    errors = [e for e in events if e.level == "error" and e.kind != "http" and not e.noise]
    seen, samples = set(), []
    for e in reversed(errors):
        key = (e.service, e.text[:80])
        if key not in seen:
            seen.add(key)
            samples.append({"service": e.service, "ts": e.ts.isoformat(), "text": e.text[:300]})
        if len(samples) >= 8:
            break

    # --- Chronologie ---
    step = timedelta(minutes=10 if hours <= 6 else 60)
    start = now - timedelta(hours=hours)
    n = int(timedelta(hours=hours) / step)
    buckets = [{"t": (start + i * step).isoformat(), "requests": 0, "errors": 0, "generations": 0} for i in range(n)]

    def slot(ts: datetime) -> dict | None:
        i = int((ts - start) / step)
        return buckets[i] if 0 <= i < n else None

    for e in api:
        if b := slot(e.ts):
            b["requests"] += 1
            b["errors"] += e.status >= 500
    for e in timings:
        if e.data["phase"] == "total" and (b := slot(e.ts)):
            b["generations"] += 1

    return {
        "window_hours": hours,
        "lines": len(events),
        "noise_lines": sum(e.noise for e in events),
        "services": {k: dict(v) for k, v in sorted(services.items())},
        "api": api_stats,
        "llm": llm_stats,
        "scanners": scanners[:10],
        "error_samples": samples,
        "timeline": buckets,
        "bucket_minutes": int(step.total_seconds() // 60),
    }


def _finding(severity: str, title: str, detail: str, command: str | None = None, source: str | None = None) -> dict:
    return {"severity": severity, "title": title, "detail": detail, "command": command, "source": source}


def _fmt(n: float | None, unit: str = "") -> str:
    if n is None:
        return "?"
    s = f"{n:.1f}".rstrip("0").rstrip(".") if isinstance(n, float) else str(n)
    return f"{s}{unit}"


def compute_findings(containers: list[dict], stats: dict) -> list[dict]:
    out: list[dict] = []
    names = {c["service"]: c["name"] for c in containers}
    hours = stats["window_hours"]

    for c in containers:
        name, svc = c["name"], c["service"]
        if c["state"] != "running":
            if svc == "model-init" and c["exit_code"] == 0:
                continue  # conteneur prévu pour s'arrêter après le téléchargement du modèle
            out.append(_finding("urgent", f"Le conteneur {svc} est arrêté",
                                f"État « {c['state']} », code de sortie {c['exit_code']}.",
                                f"docker logs --tail 50 {name}", svc))
        if c["health"] == "unhealthy":
            out.append(_finding("urgent", f"{svc} ne répond plus à son test de santé",
                                "Docker le marque « unhealthy ».", f"docker logs --tail 50 {name}", svc))
        if c["oom_killed"]:
            out.append(_finding("urgent", f"{svc} a été tué par manque de mémoire",
                                "Le système l'a arrêté car il dépassait la mémoire autorisée.",
                                "Augmenter mem_limit (OLLAMA_MEM_LIMIT dans .env) ou prendre un modèle plus petit", svc))
        if c["restarts"]:
            out.append(_finding("attention", f"{svc} a redémarré {c['restarts']} fois",
                                "Un redémarrage automatique cache souvent un plantage.",
                                f"docker logs --tail 100 {name}", svc))
        if c["mem_usage"] and c["mem_limit"] and c["mem_usage"] / c["mem_limit"] > 0.85:
            pct = round(100 * c["mem_usage"] / c["mem_limit"])
            out.append(_finding("attention", f"{svc} utilise {pct} % de sa mémoire",
                                "Au-delà de 100 %, le conteneur est tué.", f"docker stats --no-stream {name}", svc))

    api, llm = stats["api"], stats["llm"]
    e5 = api["by_status"]["5xx"]
    if e5:
        out.append(_finding("urgent" if e5 >= 5 else "attention", f"{e5} requêtes API ont échoué (erreur serveur)",
                            "Erreurs 5xx : la passerelle ou le modèle n'a pas pu répondre.",
                            f"docker logs --since {hours:g}h {names.get('gateway', 'llm-local-gateway-1')} 2>&1 | grep -i error", "gateway"))
    if api["unauthorized"]:
        n = api["unauthorized"]
        out.append(_finding("urgent" if n >= 20 else "attention", f"{n} requêtes refusées pour clé API invalide",
                            "Un client utilise une mauvaise clé" + (" — ou quelqu'un essaie de deviner la tienne." if n >= 20 else "."),
                            None, "gateway"))
    for svc, s in stats["services"].items():
        if s.get("errors"):
            sample = next((x["text"] for x in stats["error_samples"] if x["service"] == svc), "")
            out.append(_finding("attention", f"{s['errors']} lignes d'erreur dans les logs de {svc}",
                                sample[:200], f"docker logs --since {hours:g}h {names.get(svc, svc)}", svc))

    if llm["tps_avg"] is not None and llm["tps_avg"] < 3:
        out.append(_finding("attention", f"Le modèle est lent : {_fmt(llm['tps_avg'])} tokens/s en moyenne",
                            "En dessous de 3 tokens/s, une réponse de 300 mots prend plus de 2 minutes.",
                            "Essayer un modèle plus petit (LLM_MODEL) ou réduire OLLAMA_CONTEXT_LENGTH", "ollama"))
    if llm["gen_s_max"] and llm["gen_s_max"] > 300:
        out.append(_finding("attention", f"La plus longue génération a duré {_fmt(llm['gen_s_max'])} s",
                            "La limite est de 600 s : au-delà, la requête est coupée.",
                            "Limiter max_tokens côté client", "ollama"))
    if llm["loads"] >= 3:
        out.append(_finding("attention", f"Le modèle a été rechargé {llm['loads']} fois",
                            f"Chaque chargement prend environ {_fmt(llm['load_s_avg'])} s pendant lesquelles rien ne répond.",
                            "Augmenter OLLAMA_KEEP_ALIVE dans .env (ex. 2h)", "ollama"))
    if llm["cpu_busy_events"] >= 5:
        out.append(_finding("info", "Le processeur a été saturé pendant les générations",
                            f"La passerelle a pris du retard sur ses tâches internes {llm['cpu_busy_events']} fois. "
                            "C'est normal sur CPU, mais deux requêtes en même temps seront lentes.", None, "gateway"))
    for s in stats["scanners"]:
        out.append(_finding("attention", f"Un robot fouille le serveur : {s['ip']}",
                            f"{s['hits']} requêtes refusées, par exemple vers {', '.join(s['paths'][:3])}. "
                            "Elles sont bloquées, mais cette adresse cherche des failles.",
                            f"sudo ufw deny from {s['ip']}   # sur le VPS", "edge"))

    if not any(f["severity"] in ("urgent", "attention") for f in out):
        if api["requests"] or llm["generations"]:
            out.append(_finding("ok", "Tout fonctionne normalement",
                                f"{api['requests']} requêtes API, {llm['generations']} générations, aucune erreur.", None, None))
        else:
            out.append(_finding("info", "Aucune activité sur la période",
                                "Tous les services tournent, mais personne n'a utilisé le modèle.", None, None))
    if llm["generations"] and llm["tps_avg"] and llm["tps_avg"] >= 3:
        out.append(_finding("ok", f"Vitesse du modèle correcte : {_fmt(llm['tps_avg'])} tokens/s",
                            f"{llm['generations']} générations, durée moyenne {_fmt(llm['gen_s_avg'])} s.", None, "ollama"))

    out.sort(key=lambda f: SEVERITY_ORDER[f["severity"]])
    return out


def overall(findings: list[dict]) -> str:
    sev = {f["severity"] for f in findings}
    return "urgent" if "urgent" in sev else "attention" if "attention" in sev else "ok"
