"""
BioCLIP-based plant identification service.

Self-hosted, zero-shot plant identification using BioCLIP
(imageomics/bioclip via open_clip) on local GPU.

Architecture:
  - Singleton model loaded once on first call
  - Text embeddings for all species precomputed (via precompute_embeddings.py)
  - Image → BioCLIP → cosine similarity with text embeddings → top-K
"""

import logging
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)

_EMBEDDINGS_DIR = Path(__file__).resolve().parent.parent / "data" / "bioclip"
_EMBEDDINGS_PATH = _EMBEDDINGS_DIR / "species_embeddings.npy"
_SPECIES_IDS_PATH = _EMBEDDINGS_DIR / "species_ids.npy"

# BioCLIP model identifier for open_clip
_MODEL_NAME = "hf-hub:imageomics/bioclip"


class BioClipService:
    """Singleton BioCLIP inference service on GPU."""

    def __init__(self):
        self._model = None
        self._preprocess = None
        self._tokenizer = None
        self._device = None
        self._text_embeddings: np.ndarray | None = None
        self._species_ids: list[int] | None = None
        self._latin_names: list[str] | None = None

    def load_model(self):
        """Load BioCLIP model and processor (one-time, lazy)."""
        if self._model is not None:
            return

        import torch
        import open_clip

        self._device = "cuda" if torch.cuda.is_available() else "cpu"
        logger.info(f"Loading BioCLIP on {self._device}...")

        model, _, preprocess = open_clip.create_model_and_transforms(
            _MODEL_NAME,
        )
        self._model = model.to(self._device)
        self._model.eval()
        self._preprocess = preprocess
        self._tokenizer = open_clip.get_tokenizer(_MODEL_NAME)

        logger.info("BioCLIP loaded successfully")

    def load_embeddings(self) -> bool:
        """Load precomputed text embeddings from disk.

        Returns True if loaded, False if embeddings don't exist yet.
        """
        if not _EMBEDDINGS_PATH.exists() or not _SPECIES_IDS_PATH.exists():
            logger.warning(
                f"Embeddings not found at {_EMBEDDINGS_PATH}. "
                "Run scripts/precompute_embeddings.py first."
            )
            return False

        self._text_embeddings = np.load(_EMBEDDINGS_PATH)
        ids_and_names = np.load(_SPECIES_IDS_PATH, allow_pickle=True)

        self._species_ids = [int(x[0]) for x in ids_and_names]
        self._latin_names = [str(x[1]) for x in ids_and_names]

        logger.info(
            f"Loaded {len(self._species_ids)} species embeddings "
            f"(shape: {self._text_embeddings.shape})"
        )
        return True

    @property
    def is_ready(self) -> bool:
        return (
            self._model is not None
            and self._text_embeddings is not None
        )

    def embed_image(self, image) -> np.ndarray:
        """Encode a PIL image into a normalized CLIP embedding.

        Args:
            image: PIL Image (RGB).

        Returns:
            Normalized embedding vector of shape (embed_dim,).
        """
        self.load_model()

        import torch

        image_tensor = self._preprocess(image).unsqueeze(0).to(self._device)

        with torch.no_grad():
            embedding = self._model.encode_image(image_tensor)
            embedding = embedding / embedding.norm(dim=-1, keepdim=True)

        return embedding.cpu().numpy().squeeze()

    def embed_text(self, texts: list[str]) -> np.ndarray:
        """Encode text prompts into normalized CLIP embeddings.

        Args:
            texts: List of text prompts (e.g. scientific names).

        Returns:
            Normalized embeddings (len(texts), embed_dim).
        """
        self.load_model()

        import torch

        text = self._tokenizer(texts).to(self._device)

        with torch.no_grad():
            embeddings = self._model.encode_text(text)
            embeddings = embeddings / embeddings.norm(dim=-1, keepdim=True)

        return embeddings.cpu().numpy()

    def identify(
        self,
        image_embedding: np.ndarray,
        top_k: int = 5,
        confidence_threshold: float = 0.0,
    ) -> list[tuple[int, float]]:
        """Find closest species matches by raw cosine similarity.

        Uses raw cosine similarity (not softmax) because with 6,000+
        species the softmax over top-K gives misleadingly uniform scores.

        Typical raw similarity values:
            > 0.25  — good match
            0.20-0.25 — plausible
            < 0.20  — weak match

        Args:
            image_embedding: Image embedding vector (embed_dim,).
            top_k: Number of results to return.
            confidence_threshold: Minimum raw cosine similarity.

        Returns:
            List of (species_id, raw_cosine_similarity) tuples, sorted desc.
        """
        if self._text_embeddings is None:
            raise RuntimeError(
                "Text embeddings not loaded. Run load_embeddings() first."
            )

        similarities = self._text_embeddings @ image_embedding

        # Top-K by raw similarity
        top_indices = np.argsort(similarities)[-top_k:][::-1]

        results = []
        for idx in top_indices:
            sim = float(similarities[idx])
            if sim < confidence_threshold:
                continue
            results.append((int(self._species_ids[idx]), sim))

        return results


# Module-level singleton
_service = BioClipService()


def get_service() -> BioClipService:
    """Get or create the singleton BioClipService instance."""
    return _service
