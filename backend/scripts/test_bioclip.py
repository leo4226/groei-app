"""
Test script: download a species image and run BioCLIP identification.
"""
import asyncio
import sys
import os
from pathlib import Path

# Add backend root
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv()

import requests
from PIL import Image
from io import BytesIO

from database import init_pool, get_db
from services.bioclip_id import get_service


async def main():
    await init_pool()
    try:
        # 1. Fetch a sample image URL from the DB
        async with get_db() as db:
            rows = await db.execute_fetchall(
                "SELECT ps.latin_name, ps.common_name_nl, si.url "
                "FROM species_images si "
                "JOIN plant_species ps ON si.species_id = ps.id "
                "WHERE si.url != '' AND ps.latin_name != '' "
                "ORDER BY random() LIMIT 1"
            )
        if not rows:
            print("No images found in database!")
            return
            
        latin_name = rows[0]["latin_name"]
        common_name = rows[0].get("common_name_nl", "")
        image_url = rows[0]["url"]
        print(f"\n📸 Test image: {latin_name} ({common_name})")
        print(f"   URL: {image_url}")
        
        # 2. Download the image
        resp = requests.get(image_url, timeout=30)
        resp.raise_for_status()
        pil_image = Image.open(BytesIO(resp.content)).convert("RGB")
        print(f"   Size: {pil_image.size}")
        
        # 3. Run BioCLIP identification
        print("\n🔬 Running BioCLIP identification...")
        bioclip = get_service()
        bioclip.load_model()
        bioclip.load_embeddings()
        
        image_emb = bioclip.embed_image(pil_image)
        matches = bioclip.identify(image_emb, top_k=5)
        
        print(f"\n📊 Results:")
        print(f"{'Rank':<5} {'Species ID':<11} {'Confidence':<12} {'Latin Name'}")
        print("-" * 60)
        
        async with get_db() as db:
            for rank, (species_id, confidence) in enumerate(matches, 1):
                rows = await db.execute_fetchall(
                    "SELECT latin_name, common_name_nl, common_name_en "
                    "FROM plant_species WHERE id = ?",
                    (species_id,),
                )
                if rows:
                    row = rows[0]
                    name = f"{row['latin_name']} ({row.get('common_name_nl', '')})"
                else:
                    name = f"species_id={species_id}"
                    
                # Highlight if it matches the truth
                truth = " <<< TRUE" if (rows and rows[0]["latin_name"] == latin_name) else ""
                print(f"{rank:<5} {species_id:<11} {confidence:.4f}     {name}{truth}")
        
        top_conf = matches[0][1] if matches else 0
        if top_conf < 0.3:
            print(f"\n⚠️  Low confidence ({top_conf:.2f}) — may need fine-tuning")
        else:
            print(f"\n✅ Top confidence: {top_conf:.2f} — BioCLIP working well!")
            
    finally:
        from database import close_pool
        await close_pool()


if __name__ == "__main__":
    asyncio.run(main())
