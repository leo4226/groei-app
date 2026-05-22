# Leonnetje AI Chatbot — Plan

## Goal
Maak van Leonnetje een interactieve chatbot die vragen kan beantwoorden over de planten en data in de Floreren app, met een eigen (lokaal of cloud-gehost) AI model.

## Archtectuur opties (geprioriteerd)

### Fase 1 — DeepSeek API (nu, ~2 dagen werk)
**Waarom eerst:** DeepSeek API key draait al op de Floreren backend. Geen extra infra, geen extra kosten.

**Wat bouwen we:**
- Chat-UI in het bestaande HelpAssistant bottom sheet
- Nieuw backend endpoint `POST /api/chat` met:
  - System prompt: "Je bent Leonnetje, een sassy plantenhelper van de Floreren app. Je mag ALLEEN antwoorden op basis van de volgende context..."
  - RAG: plantendata laden, chunken (per species, care instructions), embedden met OpenAI/text-embedding-ada-002 of een simpele keyword search
  - Context injectie: relevante plantchunks + user's planten + calendar events meesturen
- Frontend: text input + message list in het HelpAssistant sheet

**Files:**
- `backend/routers/chat.py` — nieuw
- `backend/main.py` — router mounten
- `frontend/src/components/HelpAssistant.tsx` — uitbreiden met chat-modus
- `frontend/src/api/chat.ts` — nieuw, API wrapper

### Fase 2 — Fly.io Ollama (als je lokaal/cloud eigen wil)
**Hoe:** Ollama als sidecar process in dezelfde Fly.io machine als de Floreren backend.

**Config:**
```
# fly.toml
[processes]
  web    = "uvicorn main:app --port 8080"
  ollama = "ollama serve"

[mounts]
  source      = "ollama_models"
  destination = "/root/.ollama"
```

**Model keuze (CPU-only op Fly.io):**
| Model | RAM | Tokens/sec | Kosten/mnd |
|---|---|---|---|
| qwen2.5:0.5b | 1GB | 30-50 t/s | $5-10 |
| qwen2.5:1.5b | 1.5GB | 10-20 t/s | $10-15 |
| qwen2.5:3b | 2.5GB | 5-8 t/s | $15-25 |

- Bij Fly.io GPU (L40S, $0.50/uur) -> ~$360/maand, niet waard voor hobby.

### Fase 3 — Replicate (alternatief voor Fly.io Ollama)
Geen infra, geen GPU, pay-per-use:
- Qwen2.5-7B via API
- ~$0.0002/token = ~5000 antwoorden voor $1
- Werkt overal waar HTTP werkt

### Niet doen — Browser (WebLLM / WebGPU)
- Werkt niet op iOS Safari (geen WebGPU)
- 350MB+ download per sessie
- Kleine modellen (0.5B) zijn te dom voor bruikbare antwoorden

## Data flow (voor alle fases)

```
User: "Hoeveel water heeft mijn Monstera nodig?"

[Frontend] → POST /api/chat { message, plantIds? }
  → [Backend]
    1. Zoek relevante plant chunks via RAG (keyword + embedding)
    2. Bouw context: system prompt + plantdata + user context
    3. Stuur naar LLM (DeepSeek / Ollama / Replicate)
    4. Return antwoord
  → [Frontend] toon in chat bubble
```

## RAG setup
- **Chunks:** per plant species (~200-500 tokens per chunk: naam, familie, care instructions, water, light, soil, temp)
- **Embeddings:** `text-embedding-ada-002` (OpenAI) of lokale `all-MiniLM-L6-v2`
- **Vector store:** in-memory voor nu (kleine dataset), later PostgreSQL pgvector op Fly.io
- **Fallback:** keyword search (TfIdf / BM25) als embeddings niet loaded zijn

## Prioriteiten
1. ✅ Fase 1 — DeepSeek Leonnetje chat (snelst, beste kwaliteit)
2. 🔲 Fase 2 — Fly.io Ollama (eigen model, geen externe API)
3. 🔲 Fase 3 — Replicate (als alternatief voor Ollama, geen serverbeheer)

## Open vragen
- Hoeveel plant species zitten er in de dataset? (voor RAG chunk strategie)
- Moet Leonnetje ook calendar events / taken kunnen aanpassen? (actie-modus)
- Moet de chat historie persistent zijn? (per user in DB of in-memory per sessie)
