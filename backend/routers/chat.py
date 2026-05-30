import os
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from auth import get_current_account
from database import db_dep

router = APIRouter()

CHATBOT_URL = os.getenv("CHATBOT_URL", "https://chatbot.floreren.app/chat")


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []


class BotRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []
    plants_context: str = ""
    maps_context: str = ""


class ChatResponse(BaseModel):
    response: str


async def _fetch_maps_context(db, household_id: int) -> str:
    """Fetch all maps for the household + plant counts per map."""
    rows = await db.execute_fetchall(
        """SELECT m.id, m.name, m.map_type,
                  COUNT(p.id) as plant_count
           FROM maps m
           LEFT JOIN plants p ON p.map_id = m.id AND p.is_active = 1
           WHERE m.household_id = ?
           GROUP BY m.id
           ORDER BY m.sort_order""",
        (household_id,),
    )
    if not rows:
        return ""

    parts = []
    total_plants = 0
    for r in rows:
        total_plants += r["plant_count"]
        map_type = "tuin" if r["map_type"] == "outdoor" else "binnen"
        parts.append(f"  - {r['name']} ({map_type}): {r['plant_count']} planten")

    parts.append(f"\n  Totaal: {total_plants} planten over {len(rows)} kaarten")
    return "Jouw kaarten:\n" + "\n".join(parts)


async def _fetch_plants_context(db, household_id: int) -> str:
    """Fetch all active plants + upcoming care for a household, formatted as context."""
    # Get plants
    rows = await db.execute_fetchall(
        """SELECT p.id, p.name, p.species, p.sun_requirement, p.plant_type, p.phase,
                  l.name as location_name,
                  s.common_name_nl, s.common_name_en, s.latin_name
           FROM plants p
           LEFT JOIN locations l ON p.location_id = l.id
           LEFT JOIN plant_species s ON p.species_id = s.id
           WHERE p.is_active = 1 AND p.household_id = ?
           ORDER BY p.name""",
        (household_id,),
    )
    if not rows:
        return ""

    plant_ids = [r["id"] for r in rows]

    # Get next care task per plant (most urgent first)
    care_rows = await db.execute_fetchall(
        f"""SELECT cs.plant_id, cs.care_type, cs.next_due
            FROM care_schedules cs
            WHERE cs.plant_id IN ({",".join("?" for _ in plant_ids)})
              AND cs.is_active = 1
            ORDER BY cs.next_due ASC""",
        plant_ids,
    )

    care_by_plant: dict[int, list[dict]] = {}
    for c in care_rows:
        care_by_plant.setdefault(c["plant_id"], []).append(dict(c))

    # Format each plant as a line
    parts = []
    for r in rows:
        p = dict(r)
        details = [p["name"]]

        # Species info
        species_parts = []
        if p.get("common_name_nl"):
            species_parts.append(p["common_name_nl"])
        if p.get("latin_name"):
            species_parts.append(p["latin_name"])
        if species_parts:
            details.append(f"({', '.join(species_parts)})")

        if p.get("location_name"):
            details.append(f"@ {p['location_name']}")
        if p.get("sun_requirement"):
            details.append(p["sun_requirement"].replace("_", " "))
        if p.get("plant_type"):
            details.append(p["plant_type"])
        if p.get("phase") and p["phase"] != "established":
            details.append(p["phase"])

        # Care tasks
        tasks = care_by_plant.get(p["id"], [])
        if tasks:
            upcoming = [f"{c['care_type']} due {c['next_due']}" for c in tasks[:2]]
            details.append(" | next: " + ", ".join(upcoming))

        parts.append("  - " + ", ".join(details))

    return "Your garden has these plants:\n" + "\n".join(parts)


@router.post("/chat", response_model=ChatResponse)
async def proxy_chat(req: ChatRequest, db=Depends(db_dep), account=Depends(get_current_account)):
    """Forward chat message to Stekkie with user's plants as context."""
    try:
        # Fetch the user's plants and maps for context
        plants_ctx = await _fetch_plants_context(db, account["household_id"])
        maps_ctx = await _fetch_maps_context(db, account["household_id"])

        async with httpx.AsyncClient(timeout=70.0) as client:
            bot_req = BotRequest(
                message=req.message,
                history=req.history,
                plants_context=plants_ctx,
                maps_context=maps_ctx,
            )
            resp = await client.post(
                CHATBOT_URL,
                json=bot_req.model_dump(),
                headers={"Content-Type": "application/json"},
            )
            resp.raise_for_status()
            return resp.json()
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Chatbot reageert niet (timeout)")
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Chatbot onbereikbaar: {e}")
