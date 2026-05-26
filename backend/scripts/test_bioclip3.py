"""
Test BioCLIP and show raw cosine similarities (not softmax).
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from dotenv import load_dotenv
load_dotenv()

import numpy as np
import requests
from PIL import Image
from io import BytesIO

from database import init_pool, get_db, close_pool
from services.bioclip_id import get_service

HEADERS = {"User-Agent": "Floreren/1.0 (test; leon_korbee@hotmail.com)"}

TEST_IMAGES = [
    ("https://images.pexels.com/photos/1167355/pexels-photo-1167355.jpeg", "leaf_pexels"),
    ("https://images.pexels.com/photos/4503751/pexels-photo-4503751.jpeg", "succulent_pexels"),
]


async def main():
    await init_pool()
    try:
        bioclip = get_service()
        bioclip.load_model()
        bioclip.load_embeddings()

        for image_url, label in TEST_IMAGES:
            print(f"\n{'='*60}")
            print(f"📸 {label}: {image_url[:80]}...")
            
            resp = requests.get(image_url, headers=HEADERS, timeout=30)
            resp.raise_for_status()
            pil_image = Image.open(BytesIO(resp.content)).convert("RGB")
            
            # Get image embedding
            import torch
            image_tensor = bioclip._preprocess(pil_image).unsqueeze(0).to(bioclip._device)
            with torch.no_grad():
                img_emb = bioclip._model.encode_image(image_tensor)
                img_emb = img_emb / img_emb.norm(dim=-1, keepdim=True)
            
            img_np = img_emb.cpu().numpy().squeeze()
            
            # Raw cosine similarities with ALL text embeddings
            similarities = bioclip._text_embeddings @ img_np  # (6491,) array
            
            print(f"\nSimilarity stats:")
            print(f"  Min:    {similarities.min():.4f}")
            print(f"  Max:    {similarities.max():.4f}")
            print(f"  Mean:   {similarities.mean():.4f}")
            print(f"  Median: {np.median(similarities):.4f}")
            print(f"  Std:    {similarities.std():.4f}")
            
            # Top 10 by raw similarity
            top10_idx = np.argsort(similarities)[-10:][::-1]
            print(f"\nTop 10 by raw cosine similarity:")
            print(f"{'Rank':<5} {'Sim':<10} {'Species ID':<11} {'Latin Name'}")
            print("-" * 60)
            
            async with get_db() as db:
                for rank, idx in enumerate(top10_idx, 1):
                    species_id = bioclip._species_ids[idx]
                    sim = similarities[idx]
                    rows = await db.execute_fetchall(
                        "SELECT latin_name, common_name_nl FROM plant_species WHERE id = ?",
                        (species_id,),
                    )
                    name = rows[0]['latin_name'] if rows else f"id={species_id}"
                    nl = rows[0].get('common_name_nl', '') if rows else ''
                    print(f"{rank:<5} {sim:<10.4f} {species_id:<11} {name} ({nl})")
            
            # Histogram of similarities
            # Show distribution in bins
            bins = [-1.0, -0.5, -0.2, -0.1, 0, 0.1, 0.2, 0.3, 0.4, 0.5, 1.0]
            print(f"\nDistribution across {len(similarities)} species:")
            for i in range(len(bins)-1):
                count = np.sum((similarities >= bins[i]) & (similarities < bins[i+1]))
                bar = '#' * (count // 200)
                print(f"  [{bins[i]:>4.1f}, {bins[i+1]:>4.1f}): {count:5d} {bar}")
                
    finally:
        await close_pool()

if __name__ == "__main__":
    asyncio.run(main())
