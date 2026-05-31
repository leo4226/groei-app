# Plan: LLM-gegenereerde planticonen

## Overzicht

Vervang de hardcoded SVG templates in `icon_generator.py` door een Ollama-aanroep die per plantsoort een uniek SVG-icoon genereert. Geen fallback — als Qwen faalt, wordt de soort overgeslagen.

## Wat er gaat veranderen

### 1. `icon_generator.py` — nieuwe `OllamaSVGGenerator`

- Nieuwe klasse `OllamaSVGGenerator` naast de bestaande `generate_icon_svg`-functie
- Roept `qwen3.5:9b` aan via Ollama HTTP API (`http://localhost:11434/api/generate`)
- Prompt genereert tegelijk **potted** en **bare** variant per species
- Validatie: SVG moet valide XML zijn, viewBox bevatten, geen html wrappers
- Retry/error handling: max 2 retries, skip op failure

### 2. Prompt design

Het LLM krijgt:
- De nederlandse & latijnse naam
- Categoriehint (`guess_category()` — kamerplant, boom, succulent, etc.)
- Stijlgids: plat, 2D, clean, moderne botanische vectorstijl op donkere achtergrond
- Output format: `<svg>...</svg>` met viewBox `0 0 100 100`
- Genereert **twee** varianten: met pot/potted en zonder pot/bare

### 3. Admin endpoint

- Nieuw endpoint `POST /admin-panel/generate-icons-ai`
- Zoekt alle species met een latijnse naam die nog geen manifest icon hebben
- Loopt er sequential doorheen (Ollama GPU kan maar 1 request tegelijk)
- Gebruikt `asyncio.to_thread` om de sync Ollama call niet te blokkeren
- Resultaat: `{ generated: [{name, latin, icon_id, variant}], skipped: [{name, latin, error}] }`

### 4. Admin UI (frontend)

- Nieuwe tool card "Generate AI icons" in AdminPage ToolsView
- Resultaten tonen per species (potted + bare)
- Status tijdens generatie (1/30, 2/30…)

### 5. Icon synchronisatie

- Na AI-generatie: manifest.json updaten
- Sync icon_keys naar planten die matched worden
- Dit hergebruikt de bestaande sync-logica uit `/admin-panel/sync-icons`

## Openstaande vragen

- **Stijl**: welke kleurenpalet? Donker thema SVG (`#1a1a2e`-achtig) of transparante achtergrond?
- **Potted**: moet de pot altijd dezelfde vorm hebben of mag Qwen variëren per soort?
- **Batch timeout**: bij ~40 species, 3-5 sec per prompt = ~2-3 minuten. Acceptabel?

## Tasks

- [ ] **1. Prompt engineering** — test prompt met 1 soort, itereren op output kwaliteit
- [ ] **2. `OllamaSVGGenerator`** — klasse in `icon_generator.py`: prompt bouwen, Ollama aanroepen, SVG valideren, twee varianten schrijven
- [ ] **3. Admin endpoint** — `POST /admin-panel/generate-icons-ai` in `admin_panel.py`
- [ ] **4. Frontend tool card** — AI icon generation in AdminPage.tsx
- [ ] **5. Batch run** — alle ~40 missing species genereren
- [ ] **6. Verificatie** — checken op floreren.app of iconen correct laden
