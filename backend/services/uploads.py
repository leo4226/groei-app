"""Shared rules for user images on their way to public storage (R2).

Three things went wrong when each router did this itself:
- keys were a timestamp — the identify photo's to the second, and global —
  so two uploads in the same instant overwrote each other and a plant showed
  someone else's photo;
- base64 photo fields had no size cap;
- the field journal stored whatever content type the client's data URL
  claimed, so `data:text/html,…` put a web page on the public bucket.
"""
from __future__ import annotations

import base64
import binascii
import secrets
import time

MAX_DATA_URL_IMAGE_BYTES = 8 * 1024 * 1024

_EXTENSIONS = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}


def storage_key(prefix: str, extension: str = "jpg") -> str:
    """A key no other upload can collide with: millisecond time plus 64 random
    bits. The time part keeps keys roughly sortable in the bucket listing."""
    prefix = prefix.rstrip("/")
    return f"{prefix}/{int(time.time() * 1000)}-{secrets.token_hex(8)}.{extension}"


def sniff_image_type(data: bytes) -> str | None:
    """The image type the bytes actually are; None for anything else."""
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def extension_for(content_type: str) -> str:
    return _EXTENSIONS.get(content_type, "jpg")


def decode_image_data_url(
    value: str | None, *, max_bytes: int = MAX_DATA_URL_IMAGE_BYTES,
) -> tuple[bytes, str] | None:
    """Decode a base64 image (bare or `data:` URL) into (bytes, content type).

    The content type comes from the bytes, never from the client's header.
    Returns None for anything that is not a JPEG/PNG/WebP within the limit;
    the oversize check runs on the encoded length first, so a huge string is
    refused before it is decoded.
    """
    if not value:
        return None
    payload = value.split(",", 1)[1] if value.startswith("data:") and "," in value else value
    if len(payload) > (max_bytes * 4) // 3 + 4:
        return None
    try:
        data = base64.b64decode(payload, validate=False)
    except (binascii.Error, ValueError):
        return None
    if not data or len(data) > max_bytes:
        return None
    content_type = sniff_image_type(data)
    if content_type is None:
        return None
    return data, content_type
