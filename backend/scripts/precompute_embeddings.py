#!/usr/bin/env python3
"""
Precompute BioCLIP text embeddings for all species in the database.

Run once after the species database is populated:
  TMPDIR=/home/leon_/tmp python scripts/precompute_embeddings.py

Creates:
  backend/data/bioclip/species_embeddings.npy  — float32 array (N, 512)
  backend/data/bioclip/species_ids.npy           — (species_id, latin_name) pairs
"""

import asyncio
import logging
import sys
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


async def get_all_species() -> list[tuple[int, str]]:
    """Fetch all species with Latin names."""
    async with get_db() as db:
        rows = await db.execute_fetchall(
            "SELECT id, latin_name FROM plant_species "
            "WHERE latin_name IS NOT NULL AND latin_name != '' "
            "ORDER BY id"
        )
    result = [(r["id"], r["latin_name"]) for r in rows]
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

        model, _, preprocess = open_clip.create_model_and_transforms(
            "hf-hub:imageomics/bioclip",
        )
        model = model.to(device)
        model.eval()
        tokenizer = open_clip.get_tokenizer("hf-hub:imageomics/bioclip")

        logger.info("BioCLIP loaded, encoding species names...")

        species_ids: list[int] = []
        latin_names: list[str] = []
        all_embeddings: list[np.ndarray] = []

        for i in range(0, len(species), _BATCH_SIZE):
            batch = species[i : i + _BATCH_SIZE]
            batch_names = [s[1] for s in batch]
            batch_ids = [s[0] for s in batch]

            prompts = [f"a photo of {name}, a plant" for name in batch_names]
            text = tokenizer(prompts).to(device)

            with torch.no_grad():
                embeddings = model.encode_text(text)
                embeddings = embeddings / embeddings.norm(dim=-1, keepdim=True)

            species_ids.extend(batch_ids)
            latin_names.extend(batch_names)
            all_embeddings.append(embeddings.cpu().numpy().astype(np.float32))

            if (i + _BATCH_SIZE) % 512 < _BATCH_SIZE:
                logger.info(
                    f"  ... {min(i + _BATCH_SIZE, len(species))}/{len(species)}"
                )

        full_embeddings = np.concatenate(all_embeddings, axis=0)
        ids_and_names = np.array(
            [(sid, name) for sid, name in zip(species_ids, latin_names)],
            dtype=object,
        )

        _EMBEDDINGS_DIR.mkdir(parents=True, exist_ok=True)
        np.save(str(_EMBEDDINGS_DIR / "species_embeddings.npy"), full_embeddings)
        np.save(str(_EMBEDDINGS_DIR / "species_ids.npy"), ids_and_names)

        logger.info(
            f"✅ Saved {full_embeddings.shape[0]} embeddings "
            f"(shape: {full_embeddings.shape}) to {_EMBEDDINGS_DIR}"
        )

    finally:
        await close_pool()


if __name__ == "__main__":
    asyncio.run(main())
