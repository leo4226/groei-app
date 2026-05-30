# Leonnetje AI Chatbot — Local LLM Implementatieplan

> **Status:** Plan van aanpak
> **Model:** Qwen 3.5 9B (al geïnstalleerd in Ollama lokaal)
> **Architectuur:** Local LLM on Windows → Cloudflare tunnel → Floreren backend proxy → frontend

**Goal:** Upgrade Leonnetje van statische sassy bubbles naar een échte chatbot die vragen beantwoordt over de Floreren app, draaiend op een lokaal LLM (desktop, Windows) geëxposeerd via Cloudflare tunnel.

> **Belangrijk:** De chat server draait op **Windows** (niet WSL), net als de BioCLIP worker op :8001.
> Reden: de Cloudflare tunnel draait als Windows service (LocalSystem) — die bereikt WSL-poorten
> niet betrouwbaar via localhost. Door de server op Windows te draaien werkt `localhost:8002`
> in de tunnel config gegarandeerd.

**Architectuur:**
```
┌─ Windows Desktop ──────────────────────────────────┐
│  Ollama (qwen3.5:9b, :11434)  ← draait op Windows  │
│       ↑ http://localhost:11434/api/chat             │
│  Chat FastAPI server (:8002)  ← draait op Windows   │
│    POST /chat → Ollama (system prompt + history)    │
└─────────↑ CF tunnel (chatbot.floreren.app)─────────┘
                    ↑ HTTPS
┌─ Fly.io ───────────────────────────────────────────┐
│  Backend: POST /api/chat → proxy naar tunnel        │
│    + auth middleware (bestaande token flow)          │
└─────────↑ HTTPS (bestaande Floreren client)─────────┘
┌─ Browser / PWA ───────────────────────────────────┐
│  Frontend: HelpAssistant → chat UI met input + msgs │
│  + Leonnetje sbubbles → call-to-action "Stel een   │
│    vraag" ipv statische tips                       │
└────────────────────────────────────────────────────┘
```

**Tech Stack:** FastAPI (local server), Ollama, Cloudflare Tunnel, Python httpx, React + TypeScript (frontend)

---

## Taken

### Task 1: Knowledge Base — Floreren Feature Documentatie

**Objective:** Maak een complete Markdown kennisbank van alle Floreren features die als system prompt / RAG context dient voor het LLM.

**Files:**
- Create: `docs/plans/chatbot-knowledge-base.md`

**Stap 1: Inventariseer alle features**

Maak een document dat ALLE Floreren features dekt, georganiseerd per domein:

```
# Floreren Feature Knowledge Base
## Auth & Account
- Registratie, login, wachtwoord resetten
- Household/familie-accounts: uitnodigen, joinen, leden verwijderen
- Instellingen: profiel, taal (NL/EN), notificaties, abonnement
- Meerdere gebruikers per huishouden, actieve gebruiker wisselen

## Dashboard
- Overzicht van al je tuinen en planten
- Wat er vandaag moet gebeuren (water geven, bemesten, etc.)
- Verzorgingssignalen (attention-needed)
- Weer widget, did-you-know feitjes
- Plant van de dag / health status

## Planten
- Plant toevoegen (uit database of eigen naam, met foto)
- Plant detail: zorgschema, logboek, ecologiekaart
- Plant bewerken: locatie, verzorgingsfrequentie, notities
- Plant verwijderen
- Lijstweergave van alle planten

## Planten herkennen (Identify)
- BioCLIP AI: foto → species herkenning
- Confidence scoring (low/medium/high/very_high)
- "Groeit hier?" ecologie-check voor NL tuinomstandigheden
- Handmatig toevoegen als AI twijfelt

## Tuinontwerp (Map / Editor)
- Kaartweergave van je tuin (indoor/outdoor)
- Editor: muren tekenen, deuren/ramen plaatsen, schaduwcasters
- Planten positioneren op de kaart
- Zon- en schaduw simulatie (sun engine)
- Objecten toevoegen: potten, grondvlakken, hardscape
- Spot inspector (tik op een plek → zon/schaduw info)
- Kaarttypes: indoor plattegrond, outdoor tuin
- Pan en zoom op de editor

## Kalender
- Maand- en agendaweergave van verzorgingstaken
- Fenologie: bloeimaanden, zaaien, oogsten
- Alle planten op schema, aandacht nodig
- Taken afvinken

## Ecologie & Biodiversiteit
- Ecologiekaart per plant: inheems, invasief, bloemaanden
- Tuin-biodiversiteitscore
- Aantal soorten, inheemse/invasieve verhouding
- Bestuiversvriendelijke planten
- 1741+ species met ecologie-data verrijkt

## Verzorging
- Zorgschema per plant: bewateren, bemesten, snoeien, etc.
- Aanpasbare frequentie
- Logboek van uitgevoerde acties
- Automatische schema's bij planttoevoeging
- Notificaties/missers (alerts)

## Overig
- Weerdata (actueel en forecast)
- Onkruid herkennen en rapporteren
- Adminscherm: gebruikersbeheer, backfill tools
- Diepe links: map/:slug, plants/:id, etc.
```

**Stap 2: Schrijf het document**

Schrijf voor elke feature 2-5 zinnen in toegankelijk Nederlands. Max 10-15K chars totaal. Het wordt geladen in de system prompt van het LLM.

**Verification:** Document readable, accurate, covers all routes + features.

**Commit:**
```bash
git add docs/plans/chatbot-knowledge-base.md
git commit -m "docs: add chatbot knowledge base of all Floreren features"
```

---

### Task 2: Local Chat Server — FastAPI endpoint op WSL

**Objective:** Bouw een lokale FastAPI server op WSL (port 8002) die `POST /chat` exposeert, met Ollama integratie en de Floreren knowledge base als system prompt.

**Files:**
- Create: `C:\Projects\leonnetje-server\app.py` (Windows, niet WSL)
- Create: `C:\Projects\leonnetje-server\requirements.txt`
- Create: `C:\Projects\leonnetje-server\knowledge_base.md` (copy of chatbot-knowledge-base.md)

**Stap 1: Setup project (PowerShell op Windows)**

```powershell
mkdir C:\Projects\leonnetje-server
cd C:\Projects\leonnetje-server
python -m venv venv
.\venv\Scripts\activate
```

**Stap 2: requirements.txt**

```
fastapi==0.115.0
uvicorn==0.30.0
httpx==0.27.0
python-dotenv==1.0.1
```

**Stap 3: app.py — FastAPI server**

```python
import os
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Leonnetje Chat Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tunnel is auth'd at backend proxy level
    allow_methods=["*"],
    allow_headers=["*"],
)

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434/api/chat")
MODEL = os.getenv("MODEL", "qwen3.5:9b")

# Load knowledge base
kb_path = os.path.join(os.path.dirname(__file__), "knowledge_base.md")
with open(kb_path) as f:
    KNOWLEDGE_BASE = f.read()

SYSTEM_PROMPT = f"""Je bent Leonnetje, de AI-chatbot voor Floreren — een app voor plantenverzorging en tuinbeheer.
Je bent Nederlands, behulpzaam, en hebt een speelse/sassy ondertoon (maar niet gemeen).
Je beantwoordt ALLEEN vragen over de Floreren app. Als iemand vraagt naar iets buiten Floreren,
zeg je vriendelijk dat je alleen over Floreren kunt praten. Je gebruikt altijd Nederlands, tenzij
de gebruiker Engels spreekt.

HIER IS ALLE INFORMATIE DIE JE HEBT OVER FLOREREN:
{KNOWLEDGE_BASE}"""

class ChatMessage(BaseModel):
    role: str   # "user" | "assistant"
    content: str

class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []

class ChatResponse(BaseModel):
    response: str

@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL}

@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    # Limit history to last 10 messages to avoid exceeding context window
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for msg in req.history[-10:]:
        messages.append(msg.model_dump())
    messages.append({"role": "user", "content": req.message})

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(OLLAMA_URL, json={
                "model": MODEL,
                "messages": messages,
                "stream": False,
            })
            resp.raise_for_status()
            data = resp.json()
            reply = data["message"]["content"]
            return ChatResponse(response=reply)
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Ollama error: {e}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)
```

**Stap 4: Copy knowledge base (PowerShell)**

```powershell
copy C:\Users\leon_\Projects\Floreren\docs\plans\chatbot-knowledge-base.md C:\Projects\leonnetje-server\knowledge_base.md
```

**Stap 5: Test lokaal (PowerShell)**

```powershell
cd C:\Projects\leonnetje-server
.\venv\Scripts\activate
python app.py
```

Open een tweede terminal:
```powershell
# Test health
curl http://localhost:8002/health
# Test chat
curl -X POST http://localhost:8002/chat `
  -H "Content-Type: application/json" `
  -d '{"message": "Hoe voeg ik een plant toe in Floreren?"}'
```

Expected: snel antwoord (1-5 sec, afhankelijk van GPU), correct en in context van Floreren.

**Verification:** `curl /health` returns 200. `curl /chat` returns coherent Floreren-gerelateerd antwoord.

**Commit:** (in Floreren repo)
```bash
git add docs/plans/chatbot-knowledge-base.md
git commit -m "docs: add chatbot knowledge base"
```

---

### Task 3: Cloudflare Tunnel — Nieuw Ingress

**Objective:** Voeg een nieuwe hostname `chatbot.floreren.app` toe aan de bestaande Cloudflare tunnel die naar de lokale server (:8002) verwijst.

**Files:**
- Modify: `C:\Users\leon_\.cloudflared\config.yml` (voor CLI commands)
- Modify: `C:\Windows\System32\config\systemprofile\.cloudflared\config.yml` (voor de Windows service)

> **Beide** bestanden moeten identiek bijgewerkt worden. De Windows service (LocalSystem)
> leest het SystemProfile-pad; de CLI leest het gebruikersprofiel-pad. Alleen één updaten
> betekent dat de tunnel niet herstart met de nieuwe ingress.

**Stap 1: DNS record**

Voeg via Cloudflare Dashboard een CNAME record toe:
- **Type:** CNAME
- **Name:** chatbot
- **Target:** `d3e07eaa-19d7-43a7-9314-5526adb16173.cfargotunnel.com`
- **Proxy:** Proxied (orange cloud)

**OF** via `cloudflared tunnel route dns`:
```bash
cloudflared tunnel route dns d3e07eaa-19d7-43a7-9314-5526adb16173 chatbot.floreren.app
```

**Stap 2: Update beide config.yml bestanden**

Inhoud is identiek voor beide bestanden:

```yaml
tunnel: d3e07eaa-19d7-43a7-9314-5526adb16173
credentials-file: C:\Windows\System32\config\systemprofile\.cloudflared\d3e07eaa-19d7-43a7-9314-5526adb16173.json

ingress:
  - hostname: bioclip.floreren.app
    service: http://localhost:8001
  - hostname: chatbot.floreren.app
    service: http://localhost:8002
  - service: http_status:404
```

Sla dit op in BEIDE paden:
1. `C:\Users\leon_\.cloudflared\config.yml`
2. `C:\Windows\System32\config\systemprofile\.cloudflared\config.yml`

**Stap 3: Tunnel herstarten (als Windows service)**

```powershell
sc stop Cloudflared
sc start Cloudflared
```

Verificeer dat de service draait:
```powershell
sc query Cloudflared
```

**Verification:**
```bash
curl https://chatbot.floreren.app/health
```
Expected: `{"status": "ok", "model": "qwen3.5:9b"}`

---

### Task 4: Backend Proxy — `/api/chat` Endpoint op Fly.io

**Objective:** Voeg een `POST /api/chat` endpoint toe aan de Floreren backend die requests forward naar de Cloudflare tunnel. Authenticate met bestaande JWT token.

**Files:**
- Create: `backend/routers/chat.py`
- Modify: `backend/main.py` (import en include_router)
- Modify: `backend/requirements.txt` (voeg httpx toe)

**Stap 1: Aanmaken `backend/routers/chat.py`**

```python
import os
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from auth import get_current_account  # zelfde patroon als plant_care.py

router = APIRouter()

CHATBOT_URL = os.getenv("CHATBOT_URL", "https://chatbot.floreren.app/chat")

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []

class ChatResponse(BaseModel):
    response: str

@router.post("/chat", response_model=ChatResponse)
async def proxy_chat(req: ChatRequest, account=Depends(get_current_account)):
    """Forward chat message to local LLM via Cloudflare tunnel."""
    try:
        async with httpx.AsyncClient(timeout=70.0) as client:
            resp = await client.post(
                CHATBOT_URL,
                json=req.model_dump(),
                headers={"Content-Type": "application/json"},
            )
            resp.raise_for_status()
            return resp.json()
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Chatbot reageert niet (timeout)")
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Chatbot onbereikbaar: {e}")
```

**Stap 2: Registreer in `backend/main.py`**

Volg exact hetzelfde patroon als alle andere routers (lijn 93-115):

```python
# Bovenaan bij de andere imports:
from routers import chat

# Tussen de andere include_routers (bijv. na plant_care):
app.include_router(chat.router, prefix="/api")
```

Dit resulteert in het eindpunt `POST /api/chat` — consistent met alle andere routes.

**Stap 3: Voeg dependency toe**

Als `httpx` nog niet in de backend dependencies zit:
```
httpx>=0.27.0
```

**Stap 4: Test lokaal**

```bash
curl -X POST https://api.floreren.app/api/chat \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"message": "Hoe werkt de plant herkennen functie?"}'
```

**Verification:** Antwoord van LLM, correct geauthenticeerd, geen 502/504 errors.

---

### Task 5: Frontend — Chat UI in HelpAssistant

**Objective:** Vervang de statische bottom sheet met tips door een werkende chatinterface. Houd Leonnetje's karakter (sassy avatar, speech bubbles) maar maak hem interactief.

**Files:**
- Modify: `frontend/src/components/HelpAssistant.tsx` (complete rewrite van sheet content)
- Modify: `frontend/src/i18n/translations.ts` (nieuwe chat i18n keys)
- Modify: `frontend/src/i18n/nl.ts`
- Modify: `frontend/src/i18n/en.ts`
- Create: `frontend/src/api/chat.ts`

**Stap 1: Nieuwe API client `frontend/src/api/chat.ts`**

```typescript
import { getToken } from './auth'

const CHAT_URL = '/api/chat'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export async function sendChatMessage(
  message: string,
  history: ChatMessage[]
): Promise<string> {
  const token = getToken()
  const resp = await fetch(CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ message, history }),
  })
  if (!resp.ok) throw new Error(`Chat error: ${resp.status}`)
  const data = await resp.json()
  return data.response
}
```

**Stap 2: Nieuwe i18n keys**

In `translations.ts`, voeg toe onder `help:`:

```typescript
chat: {
  inputPlaceholder: string
  send: string
  thinking: string
  error: string
  unavailable: string
}
```

In `nl.ts`:
```typescript
chat: {
  inputPlaceholder: 'Stel een vraag over Floreren…',
  send: 'Verstuur',
  thinking: 'Leonnetje denkt na…',
  error: 'Er ging iets mis. Probeer het opnieuw.',
  unavailable: 'Chatbot is offline. Probeer later opnieuw.',
}
```

In `en.ts`:
```typescript
chat: {
  inputPlaceholder: 'Ask about Floreren…',
  send: 'Send',
  thinking: 'Leonnetje is thinking…',
  error: 'Something went wrong. Try again.',
  unavailable: 'Chatbot is offline. Try again later.',
}
```

**Stap 3: Rewrite HelpAssistant.tsx — de sheet**

Huidig: de sheet toont een avatar + title + tip card + navigation hints + close/dismiss.
Nieuw: de sheet toont een chat geschiedenis (scrollable) + inputveld + verzendknop. Houd dezelfde structuur voor backdrop, bottom sheet, avatar.

```tsx
// Vervang de sheet content (na de avatar header) door:
{/* Chat messages */}
<div className="flex-1 overflow-y-auto max-h-[50vh] space-y-2 px-1">
  {messages.length === 0 && (
    <div className="text-center py-6 text-text-muted text-sm">
      <p>Stel een vraag over Floreren.</p>
      <p className="text-xs mt-1">Bijv: "Hoe voeg ik een plant toe?"</p>
    </div>
  )}
  {messages.map((msg, i) => (
    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
        msg.role === 'user'
          ? 'bg-primary text-white rounded-br-md'
          : 'bg-bg text-text-soft rounded-bl-md'
      }`}>
        {msg.content}
      </div>
    </div>
  ))}
  {loading && (
    <div className="flex justify-start">
      <div className="bg-bg rounded-2xl rounded-bl-md px-4 py-2.5 text-sm text-text-muted italic">
        <span className="animate-pulse">{t.help.chat.thinking}</span>
      </div>
    </div>
  )}
</div>

{/* Input */}
<div className="flex gap-2 items-center border-t border-border-soft pt-3 mt-2">
  <input
    type="text"
    value={input}
    onChange={(e) => setInput(e.target.value)}
    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
    placeholder={t.help.chat.inputPlaceholder}
    disabled={loading}
    className="flex-1 bg-bg rounded-xl px-4 py-2.5 text-sm border border-border-soft focus:outline-none focus:border-primary text-text placeholder:text-text-muted/50"
  />
  <button
    onClick={handleSend}
    disabled={loading || !input.trim()}
    className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center disabled:opacity-40 active:scale-95 transition-all"
  >
    <svg>...</svg>  {/* send icon */}
  </button>
</div>
```

**Stap 4: State management in de component**

```typescript
const [messages, setMessages] = useState<ChatMessage[]>([])
const [input, setInput] = useState('')
const [loading, setLoading] = useState(false)
const messagesEndRef = useRef<HTMLDivElement>(null)

// Auto-scroll naar onder
useEffect(() => {
  messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
}, [messages])

async function handleSend() {
  if (!input.trim() || loading) return
  const userMsg = input.trim()
  setInput('')
  setMessages(prev => [...prev, { role: 'user', content: userMsg }])
  setLoading(true)
  try {
    const reply = await sendChatMessage(userMsg, messages)
    setMessages(prev => [...prev, { role: 'assistant', content: reply }])
  } catch (err) {
    const isOffline = err instanceof TypeError  // network failure = tunnel down
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: isOffline ? t.help.chat.unavailable : t.help.chat.error,
    }])
  } finally {
    setLoading(false)
  }
}
```

**Stap 5: Update speech bubbles**

Huidig: random sassy bubbles die elke 15s verschijnen.
Nieuw: random bubbles die uitnodigen om een vraag te stellen.

```typescript
function randomBubble(pageKey: PageKey, name: string): string {
  // Minder sassy, meer uitnodigend
  const bubbles: Record<PageKey, string[]> = {
    dashboard: [
      `Hé ${name}, heb je een vraag? 👋`,
      `Weet je al wat je vandaag moet doen? Vraag het me!`,
      `Tik op me voor hulp, ${name}.`,
    ],
    calendar: [
      `Wil je weten wat er deze week op de planning staat?`,
      `Vraag me naar verzorgingstips voor deze maand!`,
    ],
    settings: [
      `Wil je iets aanpassen? Ik kan uitleggen wat alles doet.`,
      `Zit je ergens mee? Ik help graag!`,
    ],
    editor: [
      `Hoe werkt de editor ook alweer? Vraag het me!`,
      `Sleep je muren? Ik leg alles uit over de editor.`,
    ],
  }
  // ...
}
```

**Stap 6: Test in browser**

```bash
cd frontend && npm run dev
```
Navigate to dashboard, open help sheet, type "Hoe voeg ik een plant toe?" — verwacht antwoord van LLM via de hele keten.

**Verification:** Chat werkt end-to-end. Foutafhandeling werkt (geen token, tunnel offline). Messages scrollen. Input disabled tijdens laden.

---

### Task 6: Windows Service / Auto-start — Leonnetje start automatisch

**Objective:** Zorg dat de Leonnetje server automatisch start bij Windows-boot, zodat niet handmatig `python app.py` gedraaid hoeft te worden.

**Opties (kies één):**

#### Optie A: Windows Task Scheduler (aanbevolen, eenvoudig)

```powershell
# Maak een start script aan
@'
cd C:\Projects\leonnetje-server
.\venv\Scripts\activate
python app.py
'@ | Out-File C:\Projects\leonnetje-server\start.ps1

# Registreer als scheduled task bij login
$action = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-WindowStyle Hidden -File C:\Projects\leonnetje-server\start.ps1"
$trigger = New-ScheduledTaskTrigger -AtLogOn
Register-ScheduledTask -TaskName "LeonnetjeServer" -Action $action -Trigger $trigger -RunLevel Highest
```

**Verification:** Log uit en in, check `curl http://localhost:8002/health`.

#### Optie B: NSSM (Non-Sucking Service Manager)

```powershell
# Download nssm.exe, dan:
nssm install LeonnetjeServer "C:\Projects\leonnetje-server\venv\Scripts\python.exe" "C:\Projects\leonnetje-server\app.py"
nssm set LeonnetjeServer AppDirectory "C:\Projects\leonnetje-server"
nssm start LeonnetjeServer
```

**Verification:** `sc query LeonnetjeServer` → Running.

---

## Volgorde

1. **Task 1** — Knowledge base (first, want nodig voor system prompt)
2. **Task 2** — Lokale server (testen met Ollama)
3. **Task 3** — Tunnel ingress (zodat backend erbij kan)
4. **Task 4** — Backend proxy (zodat frontend erbij kan)
5. **Task 5** — Frontend chat UI (laatste, want afhankelijk van alles)
6. **Task 6** — Auto-start (optioneel, laatste)

## Randvoorwaarden

- **Systeem werkt alleen als desktop aanstaat + tunnel loopt.** Dit is de bewuste keuze (geen API kosten, privacy).
- **Chat server draait op Windows** (niet WSL) — zelfde als BioCLIP worker. De Cloudflare tunnel (Windows service) bereikt `localhost:8002` dan gegarandeerd.
- **Ollama draait op Windows** — controleer met `ollama list` dat `qwen3.5:9b` beschikbaar is.
- **Qwen3.5:9b** is al in Ollama (6.6GB) — hoeft niet gepulled te worden.
- **RTX 2070 8GB VRAM** is voldoende voor inference op 9B model (Q4 quant).
- **Geen streaming** in eerste versie — simpele request/response. Streaming eventueel later.
- **Leonnetje's persoonlijkheid behouden:** sassy maar behulpzaam. System prompt stuurt dit.
- **Kennis beperkt tot Floreren:** system prompt forceert dit, geen externe kennis.
- **`CHATBOT_URL` als Fly secret** instellen zodat de backend proxy zonder herdeployment aanpasbaar is:
  ```bash
  flyctl secrets set CHATBOT_URL=https://chatbot.floreren.app/chat -a floreren-api --remote-only
  ```

## Test scenario's

1. "Hoe voeg ik een plant toe?" → antwoord moet stap voor stap uitleggen
2. "Wat is BioCLIP?" → antwoord over AI plantherkenning
3. "Hoe laat is het in New York?" → vriendelijke weigering ("Ik kan alleen over Floreren praten!")
4. Offline: backend proxy geeft 502 → frontend toont "Chatbot is offline" melding
5. Geen token: backend proxy weigert met 401 → frontend toont login
