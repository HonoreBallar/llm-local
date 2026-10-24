"""Tests des analyseurs et des règles, sur de vraies lignes copiées des conteneurs."""
from datetime import datetime, timedelta, timezone

from veilleur.analyse import compute_findings, compute_stats, overall
from veilleur.llm import check_fidelity
from veilleur.parsers import parse_go_duration, parse_lines

TS = "2026-10-20T14:09:35.123456789Z"
NOW = datetime(2026, 10, 20, 15, 0, tzinfo=timezone.utc)

OLLAMA = "\n".join(f"{TS} {line}" for line in [
    'time=2026-10-20T14:06:32.762Z level=INFO source=llama_server.go:1083 msg="loading model via llama-server" model=/x',
    'time=2026-10-20T14:07:19.040Z level=INFO source=llama_server.go:1403 msg="llama-server started in 46.29 seconds"',
    'time=2026-10-20T14:07:19.047Z level=INFO source=sched.go:788 msg="loaded runners" count=1',
    'time=2026-10-20T14:07:19.050Z level=INFO source=llama_server.go:1403 msg="llama-server started in 46.31 seconds"',
    "slot print_timing: id  0 | task 0 | n_gen =    322, tg =   5.10 t/s, tg_3s =   2.55 t/s",
    "slot print_timing: id  0 | task 0 | prompt eval time =    2626.89 ms /    41 tokens (   64.07 ms per token,    15.61 tokens per second)",
    "slot print_timing: id  0 | task 0 |        eval time =  133868.83 ms /   625 tokens (  214.53 ms per token,     4.66 tokens per second)",
    "slot print_timing: id  0 | task 0 |       total time =  136495.72 ms /   666 tokens",
    '[GIN] 2026/10/20 - 14:09:35 | 200 |          3m3s |      172.19.0.3 | POST     "/api/chat"',
    '[GIN] 2026/10/20 - 14:22:32 | 200 |      48.499µs |       127.0.0.1 | HEAD     "/"',
    'time=2026-10-20T14:10:00.000Z level=ERROR source=server.go:1 msg="model runner crashed"',
])

GATEWAY = "\n".join(f"{TS} {line}" for line in [
    'INFO:     127.0.0.1:44448 - "GET /health/liveliness HTTP/1.1" 200 OK',
    'INFO:     172.19.0.4:41770 - "GET /v1/models HTTP/1.1" 200 OK',
    'INFO:     172.19.0.1:40910 - "POST /v1/chat/completions HTTP/1.1" 200 OK',
    'INFO:     172.19.0.1:52608 - "POST /v1/messages HTTP/1.1" 401 Unauthorized',
    'INFO:     172.19.0.1:52609 - "POST /v1/chat/completions HTTP/1.1" 500 Internal Server Error',
    'Run time of job "ProxyStartupEvent.refresh_model_info (trigger: interval[0:05:00])" was missed by 0:00:01.6',
    "\x1b[32mLiteLLM: Proxy initialized with Config, Set models:\x1b[0m",
])

NGINX = "\n".join(
    f'{TS} 45.1.2.3 - - [20/Oct/2026:14:18:44 +0000] "GET {p} HTTP/1.1" 404 153 "-" "curl" "-"'
    for p in ["/.env", "/wp-login.php", "/.git/config", "/phpmyadmin/"]
)

CADDY_CONSOLE = (
    f'{TS} 2026/10/20 14:00:00.000\tINFO\thttp.log.access\thandled request\t'
    '{"request": {"remote_ip": "9.9.9.9", "method": "GET", "uri": "/v1/chat/completions"}, "status": 502, "duration": 1.5}'
)

CONTAINERS = [
    {"name": "llm-local-ollama-1", "service": "ollama", "project": "llm-local", "image": "ollama/ollama:latest",
     "state": "running", "health": "healthy", "restarts": 0, "oom_killed": False, "exit_code": 0,
     "mem_usage": 5_800_000_000, "mem_limit": 6_000_000_000},
    {"name": "llm-local-gateway-1", "service": "gateway", "project": "llm-local", "image": "ghcr.io/berriai/litellm:main-stable",
     "state": "running", "health": "healthy", "restarts": 2, "oom_killed": False, "exit_code": 0,
     "mem_usage": None, "mem_limit": None},
    {"name": "llm-local-model-init-1", "service": "model-init", "project": "llm-local", "image": "ollama/ollama:latest",
     "state": "exited", "health": None, "restarts": 0, "oom_killed": False, "exit_code": 0,
     "mem_usage": None, "mem_limit": None},
    {"name": "llm-local-frontend1-web-1", "service": "web", "project": "llm-local-frontend1", "image": "llm-local-frontend1-web",
     "state": "running", "health": None, "restarts": 0, "oom_killed": False, "exit_code": 0,
     "mem_usage": None, "mem_limit": None},
]


def events():
    evs = (parse_lines(OLLAMA, "ollama", "ollama/ollama") + parse_lines(GATEWAY, "gateway", "litellm")
           + parse_lines(NGINX, "web", "llm-local-frontend1-web"))
    return sorted(evs, key=lambda e: e.ts)


def test_go_durations():
    assert parse_go_duration("3m3s") == 183_000
    assert abs(parse_go_duration("1.399462ms") - 1.399462) < 1e-9
    assert abs(parse_go_duration("48.499µs") - 0.048499) < 1e-9


def test_ollama_lines():
    evs = parse_lines(OLLAMA, "ollama", "ollama/ollama")
    kinds = [e.kind for e in evs]
    assert kinds.count("load") == 4
    assert kinds.count("timing") == 3
    chat = next(e for e in evs if e.path == "/api/chat")
    assert chat.duration_ms == 183_000 and not chat.noise
    assert next(e for e in evs if e.path == "/").noise
    assert next(e for e in evs if "n_gen" in e.text).noise
    assert next(e for e in evs if "crashed" in e.text).level == "error"


def test_gateway_lines():
    evs = parse_lines(GATEWAY, "gateway", "litellm")
    http = [e for e in evs if e.kind == "http"]
    assert [e.noise for e in http] == [True, True, False, False, False]
    assert [e.level for e in http][2:] == ["info", "warn", "error"]
    assert next(e for e in evs if "was missed" in e.text).data == {"cpu_busy": True}
    assert "\x1b" not in evs[-1].text


def test_caddy_console_line():
    (ev,) = parse_lines(CADDY_CONSOLE, "caddy", "caddy:2.8.4-alpine")
    assert (ev.kind, ev.client, ev.status, ev.level, ev.duration_ms) == ("http", "9.9.9.9", 502, "error", 1500)


def test_stats():
    stats = compute_stats(CONTAINERS, events(), 24, NOW)
    api, llm = stats["api"], stats["llm"]
    assert api["requests"] == 3
    assert api["by_status"] == {"2xx": 1, "4xx": 1, "5xx": 1}
    assert api["unauthorized"] == 1
    assert llm["generations"] == 1 and llm["tokens_out"] == 625
    assert llm["tps_avg"] == 4.67
    assert llm["loads"] == 1 and llm["load_s_avg"] == 46.29
    assert llm["chat_s_max"] == 183.0
    assert stats["scanners"][0]["ip"] == "45.1.2.3"
    assert sum(b["requests"] for b in stats["timeline"]) == 3


def test_findings():
    stats = compute_stats(CONTAINERS, events(), 24, NOW)
    findings = compute_findings(CONTAINERS, stats)
    titles = " | ".join(f["title"] for f in findings)
    assert "model-init" not in titles  # arrêt normal
    assert "gateway a redémarré 2 fois" in titles
    assert "ollama utilise 97 % de sa mémoire" in titles
    assert "45.1.2.3" in titles
    assert "1 requêtes API ont échoué" in titles
    assert overall(findings) == "attention"
    assert findings[0]["severity"] in ("urgent", "attention")


def test_quiet_period_is_info():
    quiet = [dict(c, restarts=0, mem_usage=None) for c in CONTAINERS]
    findings = compute_findings(quiet, compute_stats(quiet, [], 24, NOW))
    assert [f["severity"] for f in findings] == ["info"]
    assert overall(findings) == "ok"


def test_fidelity():
    facts = "API : 12 requêtes, vitesse moyenne 4.66 tokens/s, la plus longue 136.5 s."
    good = check_fidelity("🟢 Tout va bien : 12 requêtes à 4,7 tokens/s, max 136.5 s.", facts, "ok")
    assert good["numbers_invented"] == [] and good["verdict_ok"]
    bad = check_fidelity("🔴 Il y a eu 47 erreurs.", facts, "ok")
    assert bad["numbers_invented"] == [47] and not bad["verdict_ok"]


def test_llama_internals_are_noise():
    raw = "\n".join(f"{TS} {line}" for line in [
        "slot launch_slot_: id  0 | task 0 | processing task, is_child = 0",
        "\tmirostat = 0, mirostat_lr = 0.100",
        "load_tensors: loading model tensors, this can take a while...",
        "llama_model_load: error loading model: failed to allocate",
    ])
    evs = parse_lines(raw, "ollama", "ollama/ollama")
    assert [e.noise for e in evs] == [True, True, True, False]
    assert evs[-1].level == "error"
