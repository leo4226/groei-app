# Floreren — Plant Identification API Plan

## Architectuurkeuze
**In de bestaande Floreren backend bouwen** (geen aparte service).
- Bestaande `/api/species` en `/api/plants/identify` endpoints zijn al in `Floreren/backend/`
- Dezelfde PostgreSQL database op Fly.io
- Frontend roept gewoon `floreren-api.fly.dev/api/species/...` aan — niks verandert

## Fases

### Phase 1 — Species Database API (NU)
Een rijke species database die later de identificatie voedt.

**Wat we bouwen:**

1. **Schema uitbreiden** — nieuwe kolommen + images tabel
2. **GBIF ETL** — importeer duizenden soorten uit GBIF
3. **Search endpoints** — full-text search op naam
4. **Image pipeline** — GBIF thumbnails ophalen
5. **Seed** — 500-1000 relevante soorten (Europese tuinplanten + kamerplanten)

### Phase 2 — Self-hosted Identification (VOLGENDE)
BioCLIP-2 zero-shot, later DINOv2 fine-tune.

### Phase 3 — API Product (OPTIONEEL)
Alleen als nodig — Leon wil gratis onbeperkt.

## Plan van Aanpak — Phase 1

### Stap 1: Schema Uitbreiden
```sql
ALTER TABLE plant_species ADD COLUMN family TEXT;
ALTER TABLE plant_species ADD COLUMN genus TEXT;
ALTER TABLE plant_species ADD COLUMN growth_form TEXT;
ALTER TABLE plant_species ADD COLUMN gbif_taxon_key BIGINT;
ALTER TABLE plant_species ADD COLUMN images_count INT DEFAULT 0;
ALTER TABLE plant_species ADD COLUMN description_nl TEXT;
ALTER TABLE plant_species ADD COLUMN description_en TEXT;

CREATE TABLE species_images (
    id SERIAL PRIMARY KEY,
    species_id INT NOT NULL REFERENCES plant_species(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    thumbnail_url TEXT,
    source TEXT NOT NULL,      -- 'gbif', 'wikidata', etc
    license TEXT,
    width INT,
    height INT,
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_species_images_species ON species_images(species_id);
```

### Stap 2: GBIF ETL Script
Script in `backend/scripts/import_gbif_species.py`:
- Query GBIF API (`https://api.gbif.org/v1/species`)
- Focus: Europese landen (Nederland, België, Duitsland, Frankrijk, UK)
- Focus: populaire kamerplanten (Araceae, Orchidaceae, succulents, etc.)
- Filter: Tracheophyta (vaatplanten), status ACCEPTED
- Haal ook media op (`/v1/species/{key}/media`)
- Sla op in `plant_species` + `species_images`
- Dedup op `latin_name` (bestaande soorten updaten, nieuwe inserten)

### Stap 3: Search Endpoints
```
GET /api/species/search?q=monstera&limit=20
  → full-text search op common_name_nl, common_name_en, latin_name
  → returned resultaten met images_count, primary image URL

GET /api/species?page=1&per_page=50
  → verbeterde paginated lijst met images

GET /api/species/{id}
  → uitgebreid: family, genus, growth_form, description, images[]
```

### Stap 4: Image Pipeline
- `scripts/download_species_images.py`
- Downloadt thumbnails van GBIF media URLs
- Slaat URLs op in `species_images`
- `is_primary` flag voor eerste/beste image

### Data Bronnen
| Bron | Licentie | Limiet | Wat |
|------|----------|--------|-----|
| GBIF API | CC0/CC-BY | 10 req/s | Species data + images |
| Wikidata SPARQL | CC0 | 5 req/s | Common names, descriptions |
| DeepSeek API | - | Betaald | Gap-filling voor beschrijvingen |

## Bestanden
```
Floreren/
  backend/
    models.py                    → + SpeciesImage, expanded PlantSpeciesOut
    routers/species.py           → + search endpoint
    services/plantnet_client.py  → (bestaat al)
    scripts/
      import_gbif_species.py     → GBIF ETL (nieuw)
      download_species_images.py → Image pipeline (nieuw)
    alembic/versions/
      0007_expand_species.py     → Schema migratie (nieuw)
  frontend/
    src/
      pages/
        SpeciesSearch.tsx        → (toekomst: species browser)
```

## GBIF Query Voorbeelden
```python
# Alle soorten in een land
GET https://api.gbif.org/v1/species/search?
  country=NL&
  limit=300&
  status=ACCEPTED&
  kingdom=Plantae&
  phylum=Tracheophyta

# Alle soorten van een genus
GET https://api.gbif.org/v1/species/search?
  genus=Monstera&
  limit=300

# Media voor een species
GET https://api.gbif.org/v1/species/{key}/media

# Vernacular names
GET https://api.gbif.org/v1/species/{key}/vernacularNames
```
