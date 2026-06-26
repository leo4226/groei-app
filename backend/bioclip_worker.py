"""
Lightweight BioCLIP inference worker — GPU-only, no auth, no DB.

Exposes a single POST /identify endpoint that accepts an image and returns
BioCLIP matches as a JSON array. Designed to run behind a Cloudflare Tunnel
so the production backend (Fly.io, no GPU) can offload ML inference here.
"""
import asyncio
import base64
import io
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

import anyio
import numpy as np
import torch
from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.responses import Response
from PIL import Image
import uvicorn

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("bioclip_worker")

_EMBEDDINGS_DIR = Path(__file__).resolve().parent / "data" / "bioclip"
_EMBEDDINGS_PATH = _EMBEDDINGS_DIR / "species_embeddings.npy"
_SPECIES_IDS_PATH = _EMBEDDINGS_DIR / "species_ids.npy"
_MODEL_NAME = "hf-hub:imageomics/bioclip"

_MAX_IMAGE_BYTES = 5 * 1024 * 1024

# Shared secret. When set, /identify and /embed-image require a matching
# X-Worker-Token header. Empty => auth disabled (local dev / not yet rolled out).
_WORKER_TOKEN = os.environ.get("BIOCLIP_WORKER_TOKEN", "")

# Serializes GPU inference — the model is not thread-safe and we run on one GPU.
# Held only around the threaded compute, so /health stays responsive meanwhile.
_infer_lock = asyncio.Lock()

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
    embeddings = np.load(_EMBEDDINGS_PATH)
    ids_and_names = np.load(_SPECIES_IDS_PATH, allow_pickle=True)
    if len(ids_and_names) != embeddings.shape[0]:
        logger.error(
            "Embedding/id misalignment: %d ids vs %d embedding rows — refusing to load",
            len(ids_and_names), embeddings.shape[0],
        )
        return False
    _text_embeddings = embeddings
    _species_ids = [int(x[0]) for x in ids_and_names]
    logger.info(
        "Loaded %d species embeddings (shape: %s)",
        len(_species_ids), _text_embeddings.shape,
    )
    return True


async def _read_upload_to_pil(image: UploadFile) -> Image.Image:
    """Read an upload, enforce size cap, decode to PIL RGB. Raises HTTPException(400) on failure."""
    image_bytes = await image.read()
    if len(image_bytes) > _MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="Image too large (max 5 MB)")
    try:
        return Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception:
        raise HTTPException(status_code=400, detail="Could not decode image")


def _embed_pil_to_float32(pil_image: Image.Image) -> np.ndarray:
    """Encode a PIL image into a 512-dim L2-normalised float32 numpy array."""
    image_tensor = _preprocess(pil_image).unsqueeze(0).to(_device)
    with torch.no_grad():
        emb = _model.encode_image(image_tensor)
        emb = emb / emb.norm(dim=-1, keepdim=True)
    return emb.cpu().numpy().squeeze().astype(np.float32)


def _identify_image(image: Image.Image, top_k: int = 5) -> tuple[list[dict], np.ndarray]:
    """Embed image, match against text embeddings, return top-K + the raw embedding."""
    _load_model()

    image_emb = _embed_pil_to_float32(image)

    similarities = _text_embeddings @ image_emb
    top_indices = np.argsort(similarities)[-top_k:][::-1]

    results = []
    for idx in top_indices:
        results.append({
            "species_id": int(_species_ids[idx]),
            "confidence": round(float(similarities[idx]), 4),
        })
    return results, image_emb


# --- FastAPI app ---

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("BioCLIP worker starting — preloading model + embeddings...")
    try:
        _load_model()
        if not _load_embeddings():
            logger.error("Failed to load embeddings — worker will return 503")
    except Exception as e:
        logger.error("Startup error: %s", e)
    yield


app = FastAPI(title="BioCLIP Worker", lifespan=lifespan)


async def _require_token(x_worker_token: str | None = Header(default=None)):
    """Enforce the shared secret when one is configured. No-op if _WORKER_TOKEN is empty."""
    if _WORKER_TOKEN and x_worker_token != _WORKER_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid or missing worker token")


@app.post("/identify", dependencies=[Depends(_require_token)])
async def identify(image: UploadFile = File(...)):
    """Accept an image file, return BioCLIP top-5 matches + the query embedding."""
    if _model is None:
        raise HTTPException(status_code=503, detail="BioCLIP model not loaded")
    if _text_embeddings is None:
        raise HTTPException(status_code=503, detail="Embeddings not loaded")

    pil_image = await _read_upload_to_pil(image)

    try:
        async with _infer_lock:
            matches, image_emb = await anyio.to_thread.run_sync(_identify_image, pil_image)
    except Exception as e:
        logger.error("Inference error: %s", e)
        raise HTTPException(status_code=500, detail="Inference failed")

    return {
        "matches": matches,
        "source": "bioclip",
        "embedding": base64.b64encode(image_emb.tobytes()).decode(),
    }


@app.post("/embed-image", dependencies=[Depends(_require_token)])
async def embed_image(image: UploadFile = File(...)):
    """Encode an image into BioCLIP's 512-dim embedding space. Returns
    the raw 2048 bytes (512 × float32) as application/octet-stream.

    Used by the backend to capture user-confirmed image embeddings for
    the retrieval layer (see /identify/commit).
    """
    if _model is None:
        raise HTTPException(status_code=503, detail="BioCLIP model not loaded")

    pil_image = await _read_upload_to_pil(image)
    async with _infer_lock:
        image_emb = await anyio.to_thread.run_sync(_embed_pil_to_float32, pil_image)
    return Response(content=image_emb.tobytes(), media_type="application/octet-stream")


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "model_loaded": _model is not None,
        "embeddings_loaded": _text_embeddings is not None,
        "device": _device or "unknown",
    }


@app.get("/coverage", dependencies=[Depends(_require_token)])
async def coverage():
    """Return the currently loaded BioCLIP reference species IDs.

    The Fly backend uses this to compare live DB species against the worker's
    precomputed embedding snapshot. This endpoint does not expose embeddings or
    user data, only integer species IDs and aggregate readiness metadata.
    """
    ready = _model is not None and _text_embeddings is not None and _species_ids is not None
    return {
        "ready": ready,
        "model_loaded": _model is not None,
        "embeddings_loaded": _text_embeddings is not None,
        "device": _device or "unknown",
        "species_count": len(_species_ids or []),
        "species_ids": list(_species_ids or []),
    }


if __name__ == "__main__":
    port = int(os.environ.get("BIOCLIP_PORT", "8001"))
    # Loopback only: cloudflared connects via localhost, so there is no reason
    # to expose the worker to the LAN.
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")
