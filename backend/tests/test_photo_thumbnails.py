"""Journal photo thumbnails (speed audit, item 5).

Lists and sheets showed the full upload (up to 1600 px) in a 48–120 px slot.
Uploads now store a ~480 px JPEG beside the photo, both cacheable for a year
(their keys are never reused), and an admin job does the same for photos
uploaded before.
"""
import io

import pytest
import pytest_asyncio
from PIL import Image

import routers.admin_panel as admin_panel
import routers.plant_photos as pp
from services.thumbnails import IMMUTABLE_CACHE, THUMB_MAX_EDGE, make_thumbnail, thumb_key
from tests.test_plant_photos import EXTRA_SCHEMA


def _jpeg(width=1600, height=1200, exif_orientation=None) -> bytes:
    image = Image.new("RGB", (width, height), (40, 120, 60))
    out = io.BytesIO()
    if exif_orientation:
        exif = Image.Exif()
        exif[0x0112] = exif_orientation
        image.save(out, format="JPEG", exif=exif)
    else:
        image.save(out, format="JPEG")
    return out.getvalue()


class RecordingStorage:
    def __init__(self, objects=None):
        self.objects = dict(objects or {})
        self.cache = {}
        self.deletes = []

    def put(self, key, data, content_type, cache_control=None):
        self.objects[key] = data
        self.cache[key] = cache_control
        return f"https://cdn.test/{key}"

    def get(self, key):
        return self.objects.get(key)

    def delete(self, key):
        self.deletes.append(key)
        self.objects.pop(key, None)

    def set_cache_control(self, key, content_type, cache_control):
        self.cache[key] = cache_control


@pytest_asyncio.fixture
async def thumb_db(seeded_db, monkeypatch):
    db = seeded_db
    await db.executescript(EXTRA_SCHEMA)
    await db.executescript("INSERT INTO plants (id, name, household_id) VALUES (1, 'Monstera', 1);")
    await db.commit()
    storage = RecordingStorage()
    monkeypatch.setattr(pp, "build_storage_from_env", lambda: storage)
    monkeypatch.setattr(admin_panel, "build_storage_from_env", lambda: storage)
    return db, storage


def test_thumbnail_is_small_jpeg_and_upright():
    thumb = make_thumbnail(_jpeg(1600, 1200, exif_orientation=6))  # 6 = rotate 90° on display
    with Image.open(io.BytesIO(thumb)) as image:
        assert image.format == "JPEG"
        assert max(image.size) == THUMB_MAX_EDGE
        # The stored pixels were landscape; the photo is shown portrait.
        assert image.size[1] > image.size[0]
    assert len(thumb) < 60_000


def test_an_image_declaring_huge_dimensions_is_not_decoded():
    # 7000 x 5000 = 35 MP, but a 1-bit PNG of one colour is a few KB: the
    # shape of a decompression bomb. It must be refused before decoding.
    out = io.BytesIO()
    Image.new("1", (7000, 5000)).save(out, format="PNG")
    assert len(out.getvalue()) < 100_000
    assert make_thumbnail(out.getvalue()) is None


def test_a_large_phone_jpeg_still_gets_a_thumbnail():
    # Decoded at reduced scale, so 6000 x 4500 (27 MP) stays within the cap.
    thumb = make_thumbnail(_jpeg(6000, 4500))
    with Image.open(io.BytesIO(thumb)) as image:
        assert max(image.size) == THUMB_MAX_EDGE


def test_unreadable_bytes_give_no_thumbnail():
    assert make_thumbnail(b"\xff\xd8\xffnot really a jpeg") is None


def test_thumb_key_sits_beside_the_photo():
    assert thumb_key("photos/1/2/123-ab.jpg") == "photos/1/2/123-ab.thumb.jpg"


@pytest.mark.asyncio
async def test_upload_stores_a_cacheable_thumbnail_and_points_the_plant_at_it(client, thumb_db, auth_header):
    db, storage = thumb_db
    res = await client.post(
        "/api/plants/1/photos",
        files={"file": ("p.jpg", _jpeg(), "image/jpeg")},
        headers=auth_header,
    )
    assert res.status_code == 200, res.text
    body = res.json()

    assert body["thumb_url"] and body["thumb_url"].endswith(".thumb.jpg")
    photo_key = body["url"].removeprefix("https://cdn.test/")
    assert storage.cache[photo_key] == IMMUTABLE_CACHE
    assert storage.cache[thumb_key(photo_key)] == IMMUTABLE_CACHE

    plant = (await db.execute_fetchall("SELECT photo_path, photo_thumb_path FROM plants WHERE id = 1"))[0]
    assert plant["photo_path"] == body["url"]
    assert plant["photo_thumb_path"] == body["thumb_url"]

    # Deleting the photo takes its thumbnail along and clears the plant's.
    res = await client.delete(f"/api/photos/{body['id']}", headers=auth_header)
    assert res.status_code == 200
    assert thumb_key(photo_key) in storage.deletes
    plant = (await db.execute_fetchall("SELECT photo_path, photo_thumb_path FROM plants WHERE id = 1"))[0]
    assert plant["photo_path"] is None and plant["photo_thumb_path"] is None


@pytest.mark.asyncio
async def test_upload_without_a_renderable_image_still_succeeds(client, thumb_db, auth_header):
    db, storage = thumb_db
    res = await client.post(
        "/api/plants/1/photos",
        files={"file": ("p.jpg", b"\xff\xd8\xff\xe0broken", "image/jpeg")},
        headers=auth_header,
    )
    assert res.status_code == 200
    assert res.json()["thumb_url"] is None


@pytest.mark.asyncio
async def test_backfill_gives_old_photos_thumbnails_and_is_rerunnable(thumb_db):
    db, storage = thumb_db
    storage.objects["photos/1/1/old.jpg"] = _jpeg()
    await db.executescript("""
        INSERT INTO plant_photos (id, plant_id, household_id, r2_key, url) VALUES
            (1, 1, 1, 'photos/1/1/old.jpg', 'https://cdn.test/photos/1/1/old.jpg'),
            (2, 1, 1, 'photos/1/1/gone.jpg', 'https://cdn.test/photos/1/1/gone.jpg');
        UPDATE plants SET photo_path = 'https://cdn.test/photos/1/1/old.jpg' WHERE id = 1;
    """)
    await db.commit()
    progress = []

    async def on_progress(done, total):
        progress.append((done, total))

    result = await admin_panel._run_backfill_photo_thumbnails(db, {}, on_progress)

    assert result["found"] == 2 and result["created"] == 1 and result["skipped"] == 1
    assert result["skipped_details"][0]["reason"] == "missing_in_storage"
    assert progress[-1] == (2, 2)
    row = (await db.execute_fetchall("SELECT thumb_url FROM plant_photos WHERE id = 1"))[0]
    assert row["thumb_url"] == "https://cdn.test/photos/1/1/old.thumb.jpg"
    assert storage.cache["photos/1/1/old.jpg"] == IMMUTABLE_CACHE
    plant = (await db.execute_fetchall("SELECT photo_thumb_path FROM plants WHERE id = 1"))[0]
    assert plant["photo_thumb_path"] == row["thumb_url"]

    again = await admin_panel._run_backfill_photo_thumbnails(db, {}, on_progress)
    assert again["found"] == 1 and again["created"] == 0
