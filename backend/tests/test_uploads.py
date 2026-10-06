"""Upload hygiene: unique keys, sniffed types, bounded sizes."""
import base64

import pytest

from services.uploads import decode_image_data_url, sniff_image_type, storage_key

JPEG = b"\xff\xd8\xff\xe0" + b"0" * 64
PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64


def _data_url(raw: bytes, claimed: str = "image/jpeg") -> str:
    return f"data:{claimed};base64,{base64.b64encode(raw).decode()}"


def test_storage_keys_never_collide_within_the_same_instant():
    keys = {storage_key("photos/identify") for _ in range(500)}
    assert len(keys) == 500
    assert all(key.startswith("photos/identify/") for key in keys)


def test_content_type_comes_from_the_bytes_not_the_header():
    assert decode_image_data_url(_data_url(PNG, claimed="image/jpeg"))[1] == "image/png"
    # A web page dressed up as a photo is refused outright.
    html = b"<html><script>alert(1)</script></html>"
    assert decode_image_data_url(_data_url(html, claimed="text/html")) is None
    assert decode_image_data_url(_data_url(html, claimed="image/jpeg")) is None
    assert sniff_image_type(b"RIFF\x00\x00\x00\x00WEBPVP8 ") == "image/webp"


def test_oversized_and_garbage_payloads_are_refused():
    assert decode_image_data_url(_data_url(JPEG + b"0" * 2048), max_bytes=1024) is None
    assert decode_image_data_url("not base64 at all !!!") is None
    assert decode_image_data_url("") is None
    assert decode_image_data_url(_data_url(JPEG))[0] == JPEG


@pytest.mark.asyncio
async def test_oversized_request_bodies_are_refused_before_any_handler(client, seeded_db, auth_header):
    from main import MAX_REQUEST_BODY_BYTES

    response = await client.post(
        "/api/discover",
        content=b"{}",
        headers={**auth_header, "Content-Type": "application/json",
                 "Content-Length": str(MAX_REQUEST_BODY_BYTES + 1)},
    )
    assert response.status_code == 413
