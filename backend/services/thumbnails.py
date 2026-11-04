"""Small JPEG thumbnails for journal photos.

Lists and sheets show a photo in a 48–120 px slot; sending the full 1600 px
upload there cost a few hundred KB per image. A thumbnail is ~480 px on its
longest edge (sharp on a 3x phone screen at 120 px), JPEG at quality 78:
typically 25–50 KB.
"""
from __future__ import annotations

import io
import logging

from PIL import Image, ImageOps

logger = logging.getLogger(__name__)

THUMB_MAX_EDGE = 480
THUMB_QUALITY = 78

#: Photo and thumbnail keys are unique per upload (services.uploads.storage_key)
#: and never rewritten, so browsers may keep them for a year without asking.
IMMUTABLE_CACHE = "public, max-age=31536000, immutable"


def thumb_key(key: str) -> str:
    """`photos/1/2/123-ab.jpg` → `photos/1/2/123-ab.thumb.jpg`."""
    stem = key.rsplit(".", 1)[0] if "." in key.rsplit("/", 1)[-1] else key
    return f"{stem}.thumb.jpg"


def make_thumbnail(data: bytes) -> bytes | None:
    """A JPEG thumbnail of `data`, or None if it cannot be read as an image.

    EXIF orientation is applied first: phone photos are often stored sideways
    with a rotation flag, and a thumbnail without that flag would show sideways.
    """
    try:
        with Image.open(io.BytesIO(data)) as image:
            image = ImageOps.exif_transpose(image)
            image.thumbnail((THUMB_MAX_EDGE, THUMB_MAX_EDGE))
            if image.mode not in ("RGB", "L"):
                image = image.convert("RGB")
            out = io.BytesIO()
            image.save(out, format="JPEG", quality=THUMB_QUALITY, optimize=True, progressive=True)
            return out.getvalue()
    except Exception:
        logger.warning("Could not render a photo thumbnail", exc_info=True)
        return None
