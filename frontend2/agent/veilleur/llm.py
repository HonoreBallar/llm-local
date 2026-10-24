"""Rédaction du rapport par le LLM local, puis contrôle de fidélité de ce qu'il a écrit."""
from __future__ import annotations

import json
import os
import re
from collections.abc import AsyncIterator

import httpx

GATEWAY = os.environ.get("LLM_GATEWAY_URL", "http://gateway:4000").rstrip("/")
API_KEY = os.environ.get("LLM_API_KEY", "")
MODEL = os.environ.get("LLM_MODEL_ALIAS", "local")
MAX_TOKENS = int(os.environ.get("REPORT_MAX_TOKENS", "400"))

LABEL = {"urgent": "URGENT", "attention": "À SURVEILLER", "info": "INFO", "ok": "OK"}
EMOJI = {"urgent": "🔴", "attention": "🟠", "ok": "🟢"}

SYSTEM = (
    "Tu es le veilleur d'un serveur qui héberge un modèle d'IA. Chaque matin, tu expliques en français simple "
    "ce qui s'est passé, à quelqu'un qui n'est pas forcément expert.\n"
    "Règles strictes :\n"
    "- Utilise uniquement les chiffres fournis, n'en invente aucun.\n"
    "- N'ajoute aucun problème qui n'est pas dans la liste des constats.\n"
    "- Ne change pas la gravité des constats.\n"
    "- Ne donne aucune commande : elles sont déjà affichées à côté de ton texte.\n"
    "- 150 mots maximum."
)


def build_facts(stats: dict, findings: list[dict]) -> str:
    api, llm = stats["api"], stats["llm"]
    lines = [f"Période analysée : dernières {stats['window_hours']:g} heures."]
    lines.append(
        f"API : {api['requests']} requêtes (réussies : {api['by_status']['2xx']}, "
        f"refusées : {api['by_status']['4xx']}, erreurs serveur : {api['by_status']['5xx']})."
    )
    if llm["generations"]:
        lines.append(
            f"Modèle : {llm['generations']} réponses générées, {llm['tokens_out']} tokens écrits, "
            f"vitesse moyenne {llm['tps_avg']} tokens/s, durée moyenne {llm['gen_s_avg']} s, "
            f"la plus longue {llm['gen_s_max']} s."
        )
    else:
        lines.append("Modèle : aucune réponse générée.")
    if llm["loads"]:
        lines.append(f"Chargements du modèle en mémoire : {llm['loads']} (environ {llm['load_s_avg']} s chacun).")
    lines.append("\nConstats (déjà classés) :")
    for i, f in enumerate(findings, 1):
        lines.append(f"{i}. [{LABEL[f['severity']]}] {f['title']}. {f['detail']}")
    return "\n".join(lines)


def build_messages(facts: str, verdict: str) -> list[dict]:
    emoji = EMOJI.get(verdict, "🟢")
    user = (
        f"{facts}\n\n"
        f"Écris le rapport : commence par {emoji} suivi d'une phrase de bilan général, "
        "puis une liste à puces avec, pour chaque constat, une phrase qui explique ce que ça veut dire "
        "concrètement et si c'est grave. Ne numérote pas les puces et n'écris pas « Constat 1 »."
    )
    return [{"role": "system", "content": SYSTEM}, {"role": "user", "content": user}]


async def stream_report(messages: list[dict]) -> AsyncIterator[dict]:
    """Produit des événements {"delta": str} puis {"usage": {...}} si la passerelle la fournit."""
    body = {
        "model": MODEL,
        "messages": messages,
        "stream": True,
        "temperature": 0.2,
        "max_tokens": MAX_TOKENS,
        "stream_options": {"include_usage": True},
    }
    headers = {"Authorization": f"Bearer {API_KEY}"}
    timeout = httpx.Timeout(connect=10, read=600, write=30, pool=10)
    async with httpx.AsyncClient(timeout=timeout) as client:
        async with client.stream("POST", f"{GATEWAY}/v1/chat/completions", json=body, headers=headers) as resp:
            if resp.status_code != 200:
                detail = (await resp.aread()).decode("utf-8", errors="replace")[:300]
                raise RuntimeError(f"La passerelle a répondu {resp.status_code} : {detail}")
            async for line in resp.aiter_lines():
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    break
                try:
                    chunk = json.loads(data)
                except ValueError:
                    continue
                if chunk.get("usage"):
                    yield {"usage": chunk["usage"]}
                for choice in chunk.get("choices") or []:
                    if text := (choice.get("delta") or {}).get("content"):
                        yield {"delta": text}


NUMBER = re.compile(r"(?<![\w.])\d+(?:[.,]\d+)?")


def _numbers(text: str) -> list[float]:
    return [float(n.replace(",", ".")) for n in NUMBER.findall(text)]


def check_fidelity(report: str, facts: str, verdict: str) -> dict:
    """Le test du LLM : a-t-il inventé des chiffres ? a-t-il respecté la gravité ?"""
    known = _numbers(facts)

    def is_known(n: float) -> bool:
        return any(n == k or n == round(k) or n == round(k, 1) for k in known)

    found = _numbers(report)
    invented = sorted({n for n in found if not is_known(n)})
    expected = EMOJI.get(verdict, "🟢")
    first = report.strip()[:4]
    used = next((e for e in EMOJI.values() if e in first), None)
    return {
        "numbers_total": len(found),
        "numbers_invented": [int(n) if n.is_integer() else n for n in invented],
        "verdict_expected": expected,
        "verdict_used": used,
        "verdict_ok": used == expected,
        "words": len(report.split()),
        "length_ok": len(report.split()) <= 180,
    }
