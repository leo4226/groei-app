"""Tracked Stekkie chat worker.

The worker produces prose with the shared Floreren LLM configuration and may
attach one deterministic, context-grounded action. The app backend remains the
authoritative validator and executor.
"""
from __future__ import annotations

import json
import logging
import os
import secrets
import time
from datetime import date, datetime, timezone
from logging.handlers import TimedRotatingFileHandler
from pathlib import Path
from typing import Any

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from care_types import STEKKIE_ACTIONABLE_CARE_TYPES
from llm_config import LLM_API_KEY, LLM_CHAT_URL, LLM_PHENOLOGY_MODEL


_CARE_COMPLETION_TERMS = {
    "water": ("water gegeven", "watered"),
    "fertilize": ("bemest", "fertilized", "fertilised"),
    "prune": ("gesnoeid", "pruned"),
    "repot": ("verpot", "repotted"),
    "mist": ("besproeid", "beneveld", "misted"),
    "rotate": ("gedraaid", "rotated"),
    "pest_check": ("op plagen gecontroleerd", "checked for pests"),
    "dust": ("bladeren afgenomen", "wiped the leaves", "dusted the leaves"),
}
_CARE_NEGATION_TERMS = (
    " niet ",
    " nooit ",
    " not ",
    " never ",
    " didn't ",
    " did not ",
    " haven't ",
    " have not ",
)
_CARE_LABELS_NL = {
    "water": "water",
    "fertilize": "bemesten",
    "prune": "snoeien",
    "repot": "verpotten",
    "mist": "benevelen",
    "rotate": "draaien",
    "pest_check": "controle op plagen",
    "dust": "bladeren afnemen",
}
_CARE_LABELS_EN = {
    "water": "watering",
    "fertilize": "fertilizing",
    "prune": "pruning",
    "repot": "repotting",
    "mist": "misting",
    "rotate": "rotating",
    "pest_check": "pest check",
    "dust": "leaf cleaning",
}

STEKKIE_MODEL = os.getenv("STEKKIE_MODEL", LLM_PHENOLOGY_MODEL)
STEKKIE_TEMPERATURE = float(os.getenv("STEKKIE_TEMPERATURE", "0.45"))
STEKKIE_MAX_TOKENS = int(os.getenv("STEKKIE_MAX_TOKENS", "800"))
STEKKIE_TIMEOUT_SECONDS = float(os.getenv("STEKKIE_TIMEOUT_SECONDS", "45"))
PROMPT_VERSION = os.getenv("STEKKIE_PROMPT_VERSION", "stekkie-v2-actions-2026-07-29")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434/api/chat")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen3.5:9b")
CHATBOT_WORKER_TOKEN = os.getenv("CHATBOT_WORKER_TOKEN", "")
INPUT_COST_PER_1M = float(os.getenv("STEKKIE_INPUT_COST_PER_1M", "0.14"))
OUTPUT_COST_PER_1M = float(os.getenv("STEKKIE_OUTPUT_COST_PER_1M", "0.28"))

_USAGE_LOG = Path(os.getenv("STEKKIE_USAGE_LOG", Path(__file__).with_name("stekkie_usage.log")))
logger = logging.getLogger("stekkie")
if not logger.handlers:
    handler = TimedRotatingFileHandler(
        _USAGE_LOG,
        when="midnight",
        backupCount=14,
        encoding="utf-8",
    )
    handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(handler)
logger.setLevel(logging.INFO)

app = FastAPI(title="Stekkie Chat Server")
KNOWLEDGE_BASE = Path(__file__).with_name("stekkie_knowledge_base.md").read_text(
    encoding="utf-8"
)


class ChatMessage(BaseModel):
    role: str
    content: str = Field(max_length=4_000)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4_000)
    history: list[ChatMessage] = Field(default_factory=list, max_length=10)
    plants_context: str = ""
    maps_context: str = ""
    biodiversity_context: str = ""
    page_context: dict[str, Any] | None = None
    garden_context: dict[str, Any] | None = None
    language: str | None = None


def _language(request: ChatRequest) -> str:
    language = request.language or (request.garden_context or {}).get("language")
    return language if language in {"nl", "en"} else "nl"


def _care_tasks(context: dict[str, Any]) -> list[dict[str, Any]]:
    packet = context.get("care_tasks") or {}
    tasks: list[dict[str, Any]] = []
    for bucket in ("overdue", "due_today", "upcoming_7_days"):
        values = packet.get(bucket) or []
        tasks.extend(value for value in values if isinstance(value, dict))
    return tasks


def build_suggested_action(request: ChatRequest) -> dict[str, Any] | None:
    """Return one deterministic action only when intent and context are unique."""
    context = request.garden_context or {}
    message = request.message.casefold()
    language = _language(request)

    navigation_terms = ("open", "waar", "find", "show", "go to", "navigate")
    navigation_requested = any(term in message for term in navigation_terms)
    if ("kalender" in message or "calendar" in message) and navigation_requested:
        return {
            "type": "navigate",
            "label": "Open the calendar" if language == "en" else "Open de kalender",
            "payload": {"target": "calendar"},
        }

    add_plant_terms = ("plant toevoegen", "add a plant", "add plant")
    if navigation_requested and any(term in message for term in add_plant_terms):
        return {
            "type": "navigate",
            "label": "Add a plant" if language == "en" else "Voeg een plant toe",
            "payload": {"target": "add_plant"},
        }

    if navigation_requested:
        if "kaart" in message or "map" in message:
            map_matches = [
                garden_map
                for garden_map in context.get("maps") or []
                if isinstance(garden_map, dict)
                and str(garden_map.get("name") or "").strip()
                and str(garden_map["name"]).casefold() in message
                and (
                    isinstance(garden_map.get("slug"), str)
                    or isinstance(garden_map.get("id"), int)
                )
            ]
            if len(map_matches) == 1:
                garden_map = map_matches[0]
                payload: dict[str, Any] = {"target": "map"}
                if isinstance(garden_map.get("slug"), str):
                    payload["slug"] = garden_map["slug"]
                else:
                    payload["id"] = garden_map["id"]
                return {
                    "type": "navigate",
                    "label": f"Open {garden_map['name']}",
                    "payload": payload,
                }

        plant_matches = [
            plant
            for plant in context.get("plants") or []
            if isinstance(plant, dict)
            and str(plant.get("name") or "").strip()
            and str(plant["name"]).casefold() in message
            and isinstance(plant.get("id"), int)
        ]
        if len(plant_matches) == 1:
            plant = plant_matches[0]
            return {
                "type": "navigate",
                "label": f"Open {plant['name']}",
                "payload": {"target": "plant", "id": plant["id"]},
            }

    care_type = next(
        (
            candidate
            for candidate, terms in _CARE_COMPLETION_TERMS.items()
            if any(term in message for term in terms)
        ),
        None,
    )
    if care_type is None:
        return None
    padded_message = f" {message} "
    if "?" in message or any(term in padded_message for term in _CARE_NEGATION_TERMS):
        return None

    matches = []
    for task in _care_tasks(context):
        if task.get("care_type") != care_type or task.get("is_ephemeral") is not False:
            continue
        if care_type not in STEKKIE_ACTIONABLE_CARE_TYPES:
            continue
        if type(task.get("plant_id")) is not int or type(task.get("schedule_id")) is not int:
            continue
        plant_name = str(task.get("plant_name") or "").strip()
        if plant_name and plant_name.casefold() in message:
            matches.append(task)

    if len(matches) != 1:
        return None

    task = matches[0]
    plant_name = str(task["plant_name"])
    language = _language(request)
    care_label = (
        _CARE_LABELS_EN[care_type]
        if language == "en"
        else _CARE_LABELS_NL[care_type]
    )
    label = (
        f"Mark {care_label} for {plant_name} as done"
        if language == "en"
        else f"Markeer {care_label} voor {plant_name} als gedaan"
    )
    return {
        "type": "mark_care_done",
        "label": label,
        "payload": {
            "plant_id": task["plant_id"],
            "schedule_id": task["schedule_id"],
            "care_type": care_type,
        },
    }


class ChatResponse(BaseModel):
    response: str
    suggested_action: dict[str, Any] | None = None


def _compact_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=str)


def _season_for_month(month: int) -> str:
    if month in (3, 4, 5):
        return "spring"
    if month in (6, 7, 8):
        return "summer"
    if month in (9, 10, 11):
        return "autumn"
    return "winter"


def build_system_prompt(request: ChatRequest) -> str:
    language = _language(request)
    today = date.today()
    if request.garden_context:
        context = "GARDEN CONTEXT JSON:\n" + _compact_json(request.garden_context)
    else:
        legacy = [
            value
            for value in (
                request.plants_context,
                request.maps_context,
                request.biodiversity_context,
            )
            if value
        ]
        context = "LEGACY CONTEXT:\n" + "\n\n".join(legacy)

    return f"""# Stekkie, Floreren garden assistant ({PROMPT_VERSION})

You help with Floreren, the user's real plants and garden, and plant care.
Be warm, practical, lightly playful, and concise. Never be mean. Never use emoji.

Runtime:
- language: {language}
- date: {today.isoformat()}
- season: {_season_for_month(today.month)}

Rules:
1. Respond in {language}, even when the user mixes languages.
2. Use supplied context. Never invent plants, tasks, weather, maps, biodiversity, or app features.
3. If essential context is missing, ask one short clarifying question rather than guessing.
4. Never guarantee plant identification, edibility, toxicity, medicinal safety, or a disease diagnosis.
5. Prioritize active warnings, overdue tasks, due-today tasks, then upcoming care.
6. End normal advice with one concrete next step. Do not claim completion unless the user says it happened.
7. Keep mobile answers short. Use no markdown table and no list longer than three items.
8. Return prose only. Do not emit JSON, fenced actions, tool calls, routes, or endpoint instructions.

{context}

FLOREREN FEATURE REFERENCE:
{KNOWLEDGE_BASE}"""


def _messages_for_provider(request: ChatRequest) -> list[dict[str, str]]:
    messages = [{"role": "system", "content": build_system_prompt(request)}]
    messages.extend(
        {"role": message.role, "content": message.content}
        for message in request.history[-10:]
        if message.role in {"user", "assistant"} and message.content
    )
    messages.append({"role": "user", "content": request.message})
    return messages


def _log_usage(
    request: ChatRequest,
    *,
    model: str,
    latency_ms: int,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    error: str | None = None,
    fallback_reason: str | None = None,
) -> None:
    action = build_suggested_action(request)
    estimated_cost = 0.0 if model.startswith("ollama/") else round(
        (prompt_tokens / 1_000_000 * INPUT_COST_PER_1M)
        + (completion_tokens / 1_000_000 * OUTPUT_COST_PER_1M),
        8,
    )
    logger.info(
        json.dumps(
            {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "model": model,
                "prompt_version": PROMPT_VERSION,
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "estimated_cost_usd": estimated_cost,
                "latency_ms": latency_ms,
                "page_route": (request.page_context or {}).get("route"),
                "action_type": action.get("type") if action else None,
                "error": error,
                "fallback_reason": fallback_reason,
            },
            ensure_ascii=False,
        )
    )


async def _call_primary_model(request: ChatRequest) -> str:
    if not LLM_API_KEY:
        raise RuntimeError("primary API key not configured")
    started = time.perf_counter()
    async with httpx.AsyncClient(timeout=STEKKIE_TIMEOUT_SECONDS) as client:
        response = await client.post(
            LLM_CHAT_URL,
            json={
                "model": STEKKIE_MODEL,
                "messages": _messages_for_provider(request),
                "temperature": STEKKIE_TEMPERATURE,
                "max_tokens": STEKKIE_MAX_TOKENS,
                "stream": False,
            },
            headers={
                "Authorization": f"Bearer {LLM_API_KEY}",
                "Content-Type": "application/json",
            },
        )
        response.raise_for_status()
        data = response.json()
    try:
        reply = data["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError, TypeError) as exc:
        raise RuntimeError("malformed primary model response") from exc
    usage = data.get("usage") or {}
    _log_usage(
        request,
        model=STEKKIE_MODEL,
        latency_ms=int((time.perf_counter() - started) * 1000),
        prompt_tokens=int(usage.get("prompt_tokens") or 0),
        completion_tokens=int(usage.get("completion_tokens") or 0),
    )
    return reply


async def _call_ollama_fallback(request: ChatRequest, reason: str) -> str:
    started = time.perf_counter()
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            OLLAMA_URL,
            json={
                "model": OLLAMA_MODEL,
                "messages": _messages_for_provider(request),
                "stream": False,
                "think": False,
            },
        )
        response.raise_for_status()
        reply = response.json()["message"]["content"].strip()
    _log_usage(
        request,
        model=f"ollama/{OLLAMA_MODEL}",
        latency_ms=int((time.perf_counter() - started) * 1000),
        fallback_reason=reason,
    )
    return reply


def _deterministic_fallback(request: ChatRequest) -> str:
    language = _language(request)
    action = build_suggested_action(request)
    if action and action["type"] == "mark_care_done":
        plant_name = action["label"].split(" voor ", 1)[-1].removesuffix(" als gedaan")
        if language == "en":
            plant_name = action["label"].split(" for ", 1)[-1].removesuffix(" as done")
        return (
            f"I understood that you completed care for {plant_name}. Confirm it below to update Floreren."
            if language == "en"
            else f"Ik begrijp dat je de verzorging voor {plant_name} hebt gedaan. Bevestig hieronder om Floreren bij te werken."
        )
    return (
        "I cannot reach the chat model right now. Please try again shortly."
        if language == "en"
        else "Ik kan het chatmodel nu niet bereiken. Probeer het zo nog eens."
    )


async def _generate_reply(request: ChatRequest) -> str:
    try:
        return await _call_primary_model(request)
    except (
        httpx.TimeoutException,
        httpx.HTTPStatusError,
        httpx.RequestError,
        RuntimeError,
        ValueError,
    ) as exc:
        reason = str(exc)[:240]
        try:
            return await _call_ollama_fallback(request, reason)
        except Exception as fallback_exc:
            _log_usage(
                request,
                model="deterministic/context-fallback",
                latency_ms=0,
                error=str(fallback_exc)[:240],
                fallback_reason=reason,
            )
            return _deterministic_fallback(request)


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "primary_model": STEKKIE_MODEL,
        "primary_configured": bool(LLM_API_KEY),
        "fallback_model": OLLAMA_MODEL,
        "prompt_version": PROMPT_VERSION,
    }


def _require_worker_token(
    x_worker_token: str | None = Header(default=None, alias="X-Worker-Token"),
) -> None:
    if CHATBOT_WORKER_TOKEN and (
        x_worker_token is None
        or not secrets.compare_digest(x_worker_token, CHATBOT_WORKER_TOKEN)
    ):
        raise HTTPException(status_code=401, detail="invalid worker token")


@app.post("/chat", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    _token: None = Depends(_require_worker_token),
) -> ChatResponse:
    return ChatResponse(
        response=await _generate_reply(request),
        suggested_action=build_suggested_action(request),
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8002)
