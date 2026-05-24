"""
Lightweight BioCLIP inference worker — GPU-only, no auth, no DB.

Exposes a single POST /identify endpoint that accepts an image and returns
BioCLIP matches as a JSON array. Designed to run behind a Cloudflare Tunnel
so the production backend (Fly.io, no GPU) can offload ML inference here.
"""
import io
import logging
import os
from pathlib import Path

import numpy as np
from fastapi import FastAPI, HTTPException, UploadFile, File
from PIL import Image
import uvicorn

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("bioclip_worker")

_EMBEDDINGS_DIR = Path(__file__).resolve().parent / "data" / "bioclip"
_EMBEDDINGS_PATH = _EMBEDDINGS_DIR / "species_embeddings.npy"
_SPECIES_IDS_PATH = _EMBEDDINGS_DIR / "species_ids.npy"
_MODEL_NAME = "hf-hub:imageomics/bioclip"

_MAX_IMAGE_BYTES = 5 * 1024 * 1024

# --- BioCLIP model (lazy-loaded on first request) ---
_model = None
_preprocess = None
_device = None
_text_embeddings: np.ndarray | None = None
_species_ids: list[int] | None = None


def _load_model():
    global _model, _preprocess, _device
    if _model is not None:
        return
    import torch
    import open_clip

    _device = "cuda" if torch.cuda.is_available() else "cpu"
    logger.info("Loading BioCLIP on %s...", _device)
    model, _, preprocess = open_clip.create_model_and_transforms(_MODEL_NAME)
    _model = model.to(_device)
    _model.eval()
    _preprocess = preprocess
    logger.info("BioCLIP model loaded")


def _load_embeddings():
    global _text_embeddings, _species_ids
    if _text_embeddings is not None:
        return True
    if not _EMBEDDINGS_PATH.exists() or not _SPECIES_IDS_PATH.exists():
        logger.error("Embeddings not found at %s", _EMBEDDINGS_PATH)
        return False
    _text_embeddings = np.load(_EMBEDDINGS_PATH)
    ids_and_names = np.load(_SPECIES_IDS_PATH, allow_pickle=True)
    _species_ids = [int(x[0]) for x in ids_and_names]
    logger.info(
        "Loaded %d species embeddings (shape: %s)",
        len(_species_ids), _text_embeddings.shape,
    )
    return True


def _identify_image(image: Image.Image, top_k: int = 5) -> list[dict]:
    """Embed image, match against text embeddings, return top-K."""
    import torch

    _load_model()

    image_tensor = _preprocess(image).unsqueeze(0).to(_device)
    with torch.no_grad():
        embedding = _model.encode_image(image_tensor)
        embedding = embedding / embedding.norm(dim=-1, keepdim=True)
    image_emb = embedding.cpu().numpy().squeeze()

    similarities = _text_embeddings @ image_emb
    top_indices = np.argsort(similarities)[-top_k:][::-1]

    results = []
    for idx in top_indices:
        results.append({
            "species_id": int(_species_ids[idx]),
            "confidence": round(float(similarities[idx]), 4),
        })
    return results


# --- FastAPI app ---

app = FastAPI(title="BioCLIP Worker")

@app.on_event("startup")
async def startup():
    logger.info("BioCLIP worker starting — preloading model + embeddings...")
    try:
        _load_model()
        ok = _load_embeddings()
        if not ok:
            logger.error("Failed to load embeddings — worker will return 503")
    except Exception as e:
        logger.error("Startup error: %s", e)


@app.post("/identify")
async def identify(image: UploadFile = File(...)):
    """Accept an image file, return BioCLIP top-5 matches."""
    if _model is None:
        raise HTTPException(status_code=503, detail="BioCLIP model not loaded")
    if _text_embeddings is None:
        raise HTTPException(status_code=503, detail="Embeddings not loaded")

    image_bytes = await image.read()
    if len(image_bytes) > _MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="Image too large (max 5 MB)")

    try:
        pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception:
        raise HTTPException(status_code=400, detail="Could not decode image")

    try:
        matches = _identify_image(pil_image)
    except Exception as e:
        logger.error("Inference error: %s", e)
        raise HTTPException(status_code=500, detail="Inference failed")

    return {"matches": matches, "source": "bioclip"}


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "model_loaded": _model is not None,
        "embeddings_loaded": _text_embeddings is not None,
        "device": _device or "unknown",
    }


if __name__ == "__main__":
    port = int(os.environ.get("BIOCLIP_PORT", "8001"))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
