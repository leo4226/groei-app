"""
Test BioCLIP with real plant photos.
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from dotenv import load_dotenv
load_dotenv()

import requests
from PIL import Image
from io import BytesIO

from database import init_pool, get_db, close_pool
from services.bioclip_id import get_service

HEADERS = {"User-Agent": "Floreren/1.0 (test; leon_korbee@hotmail.com)"}

TEST_IMAGES = [
    # Monstera-like leaf on Pexels
    ("https://images.pexels.com/photos/1167355/pexels-photo-1167355.jpeg",
     "Monstera deliciosa"),
    # Aloe-like succulent
    ("https://images.pexels.com/photos/4503751/pexels-photo-4503751.jpeg",
     "Aloe vera"),
    # Try a GBIF-sourced image from our DB
    ("https://zenodo.org/record/16906385/files/figure.png",
     "Phaseolus coccineus"),
]


async def identify_plant(image_url: str, expected: str) -> None:
    print(f"\n=== {expected} ===")
    print(f"URL: {image_url[:80]}...")
    
    try:
        resp = requests.get(image_url, headers=HEADERS, timeout=30)
        resp.raise_for_status()
        pil_image = Image.open(BytesIO(resp.content)).convert("RGB")
        print(f"Size: {pil_image.size}")
    except Exception as e:
        print(f"⚠️  Failed to download: {e}")
        return

    bioclip = get_service()
    image_emb = bioclip.embed_image(pil_image)
    matches = bioclip.identify(image_emb, top_k=5)

    top_conf = matches[0][1] if matches else 0
    
    async with get_db() as db:
        for rank, (species_id, confidence) in enumerate(matches, 1):
            rows = await db.execute_fetchall(
                "SELECT latin_name, common_name_nl FROM plant_species WHERE id = ?",
                (species_id,),
            )
            if rows:
                row = rows[0]
                name = f"{row['latin_name']} ({row.get('common_name_nl', '')})"
                truth = " <<< EXPECTED" if row['latin_name'] == expected else ""
                if row['latin_name'] == expected:
                    if rank == 1:
                        truth += " ✅"
                    else:
                        truth += f" (#{rank}, not #1)"
            else:
                name = f"species_id={species_id}"
                truth = ""
            print(f"  #{rank} {confidence:.3f}  {name}{truth}")

    print(f"  => Best confidence: {top_conf:.3f}", end="")
    if top_conf < 0.1:
        print(" ⚠️")
    elif top_conf > 0.5:
        print(" 🟢 Great!")
    else:
        print(" 🟡 Decent")


async def main():
    await init_pool()
    try:
        bioclip = get_service()
        bioclip.load_model()
        bioclip.load_embeddings()
        
        for url, expected in TEST_IMAGES:
            await identify_plant(url, expected)
    finally:
        await close_pool()


if __name__ == "__main__":
    asyncio.run(main())
