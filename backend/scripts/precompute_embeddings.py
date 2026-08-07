#!/usr/bin/env python3
"""
Precompute BioCLIP text embeddings for all species in the database.

Run once after the species database is populated (and again after any
prompt-ensemble or species-list change):
  TMPDIR=/home/leon_/tmp python scripts/precompute_embeddings.py

Creates:
  backend/data/bioclip/species_embeddings.npy  — float32 array (N, 512)
  backend/data/bioclip/species_ids.npy           — (species_id, latin_name) pairs
  backend/data/bioclip/meta.json                 — run timestamp + prompt config
                                                  (resolves audit §7 staleness)

Embedding strategy (#809): each species is encoded with a prompt ensemble
(taxonomic + English common-name templates) and the per-species embeddings are
averaged and re-normalized. This uses BioCLIP's template-ensembling strength
instead of a single bare-Latin prompt.
"""

import asyncio
import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

# Add backend root for imports
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Load .env for DATABASE_URL
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

import numpy as np
from database import init_pool, close_pool, get_db

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)

_EMBEDDINGS_DIR = Path(__file__).resolve().parent.parent / "data" / "bioclip"
_BATCH_SIZE = 64

# ── Prompt ensemble ─────────────────────────────────────────────────────────
# BioCLIP (imageomics) was trained on taxonomic + common-name prompts and
# benefits from template ensembling. We use a compact canonical set: 7
# Latin-name templates + 3 common-name templates (when the species has an
# English common name). Average per species, then re-normalize to unit length.
LATIN_TEMPLATES = [
    "a photo of {name}",
    "a photo of a {name}",
    "a photo of the {name}",
    "a photo of {name}, a plant",
    "a photo of a {name}, a plant",
    "a photo of the {name}, a plant",
    "a photo of the {name} plant",
]

COMMON_TEMPLATES = [
    "a photo of a {name}",
    "a photo of the {name}",
    "a photo of {name}, a plant",
]


def build_prompts(latin_name: str, common_name_en: str | None = None) -> list[str]:
    """Return the prompt ensemble for one species (Latin required, common optional)."""
    prompts = [t.format(name=latin_name) for t in LATIN_TEMPLATES]
    if common_name_en:
        prompts += [t.format(name=common_name_en) for t in COMMON_TEMPLATES]
    return prompts


async def get_all_species() -> list[tuple[int, str, str | None]]:
    """Fetch all species with Latin names + English common names."""
    async with get_db() as db:
        # id_enabled = FALSE species are pruned from identification (see
        # scripts/prune_catalog.py + migration 0034); skip them so BioCLIP never
        # returns the exotic-congener bloat.
        rows = await db.execute_fetchall(
            "SELECT id, latin_name, common_name_en FROM plant_species "
            "WHERE latin_name IS NOT NULL AND latin_name != '' "
            "  AND id_enabled = TRUE "
            "ORDER BY id"
        )
    result = [(r["id"], r["latin_name"], r.get("common_name_en") or None) for r in rows]
    logger.info(f"Found {len(result)} species to embed")
    return result


async def main():
    await init_pool()
    try:
        species = await get_all_species()
        if not species:
            logger.warning("No species found. Nothing to do.")
            return

        import torch
        import open_clip

        device = "cuda" if torch.cuda.is_available() else "cpu"
        logger.info(f"Loading BioCLIP on {device}...")

        model, _, _ = open_clip.create_model_and_transforms(
            "hf-hub:imageomics/bioclip",
        )
        model = model.to(device)
        model.eval()
        tokenizer = open_clip.get_tokenizer("hf-hub:imageomics/bioclip")

        logger.info("BioCLIP loaded, encoding species prompt ensembles...")

        species_ids: list[int] = []
        latin_names: list[str] = []
        all_embeddings: list[np.ndarray] = []

        for i in range(0, len(species), _BATCH_SIZE):
            batch = species[i : i + _BATCH_SIZE]

            # Flatten the per-species prompt ensembles into one tokenizer call.
            batch_prompts = [
                build_prompts(s[1], s[2])
                for s in batch
            ]
            flat_prompts = [p for prompts in batch_prompts for p in prompts]
            text = tokenizer(flat_prompts).to(device)

            with torch.no_grad():
                embeddings = model.encode_text(text)
                embeddings = embeddings / embeddings.norm(dim=-1, keepdim=True)
            embeddings = embeddings.cpu().numpy().astype(np.float32)

            # Average per species, re-normalize.
            offset = 0
            for species_row, prompts in zip(batch, batch_prompts):
                sid, latin, common = species_row
                n = len(prompts)
                chunk = embeddings[offset : offset + n]
                mean = chunk.mean(axis=0)
                norm = np.linalg.norm(mean)
                if norm > 0:
                    mean = mean / norm
                all_embeddings.append(mean)
                species_ids.append(sid)
                latin_names.append(latin)
                offset += n

            if (i + _BATCH_SIZE) % 512 < _BATCH_SIZE:
                logger.info(
                    f"  ... {min(i + _BATCH_SIZE, len(species))}/{len(species)}"
                )

        full_embeddings = np.stack(all_embeddings, axis=0)
        ids_and_names = np.array(
            [(sid, name) for sid, name in zip(species_ids, latin_names)],
            dtype=object,
        )

        _EMBEDDINGS_DIR.mkdir(parents=True, exist_ok=True)
        np.save(str(_EMBEDDINGS_DIR / "species_embeddings.npy"), full_embeddings)
        np.save(str(_EMBEDDINGS_DIR / "species_ids.npy"), ids_and_names)

        meta = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "species_count": len(species_ids),
            "prompt_strategy": "ensemble",
            "latin_templates": LATIN_TEMPLATES,
            "common_templates": COMMON_TEMPLATES,
            "embeddings_shape": list(full_embeddings.shape),
        }
        with open(_EMBEDDINGS_DIR / "meta.json", "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2, ensure_ascii=False)

        logger.info(
            f"✅ Saved {full_embeddings.shape[0]} embeddings "
            f"(shape: {full_embeddings.shape}) + meta.json to {_EMBEDDINGS_DIR}"
        )

    finally:
        await close_pool()


if __name__ == "__main__":
    asyncio.run(main())
