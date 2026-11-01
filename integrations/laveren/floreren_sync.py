#!/usr/bin/env python3
"""Pull the Floreren snapshot into a local folder for LAveren.

Standard library only, so it runs from any Python 3.9+ on Windows, macOS or
Linux without a venv. Copy this file into LAveren and run it on a schedule
(Windows Task Scheduler / cron), or import `sync()` from LAveren's backend.

    set FLOREREN_TOKEN=flo_...            (Windows)
    export FLOREREN_TOKEN=flo_...         (macOS/Linux)
    python floreren_sync.py --out ./data/floreren

What it writes:

    <out>/snapshot.json            the latest snapshot, plus `local_image` /
                                   `local_thumbnail` paths
    <out>/images/<sha>.jpg         every photo, downloaded once and kept
    <out>/thumbnails/map-<id>.svg  one SVG per map, refreshed with the snapshot
    <out>/.etag                    so an unchanged snapshot costs a 304

Mark a care task done (needs a token made with "Also allow marking care as
done"); it re-syncs afterwards so snapshot.json shows it:

    python floreren_sync.py --out ./data/floreren --done <schedule_id>

Poll gently: once when LAveren opens and at most hourly after that. The server
caches 15 minutes per token anyway, and Floreren's database is billed per
wake-up — a tight loop would keep it awake around the clock.

Get a token in Floreren → Settings → App → Connected dashboards.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

DEFAULT_URL = "https://api.floreren.app/api/integrations/snapshot"
SUPPORTED_SCHEMA = 1
USER_AGENT = "LAveren-floreren-sync/1"
# Photos live on public R2 URLs; never send the token there.
IMAGE_TIMEOUT_S = 20
SNAPSHOT_TIMEOUT_S = 30


class SyncError(RuntimeError):
    pass


def _origin(url: str) -> tuple[str, str]:
    parts = urlsplit(url)
    return parts.scheme, parts.netloc


def _endpoint(snapshot_url: str, path: str) -> str:
    """Another integration route next to the snapshot one."""
    base = snapshot_url.split("?", 1)[0]
    if not base.endswith("/snapshot"):
        raise SyncError(f"Unexpected snapshot URL: {snapshot_url}")
    return base[: -len("/snapshot")] + path


def _atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.")
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def _fetch_snapshot(url: str, token: str, lang: str | None, etag: str | None) -> tuple[bytes | None, str | None]:
    if lang:
        url = f"{url}{'&' if '?' in url else '?'}lang={lang}"
    request = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "User-Agent": USER_AGENT,
        **({"If-None-Match": etag} if etag else {}),
    })
    try:
        with urllib.request.urlopen(request, timeout=SNAPSHOT_TIMEOUT_S) as response:
            return response.read(), response.headers.get("ETag")
    except urllib.error.HTTPError as error:
        if error.code == 304:
            return None, etag
        if error.code == 401:
            raise SyncError(
                "Token rejected (revoked, or the password was changed). "
                "Make a new one in Floreren → Settings → Connected dashboards."
            ) from None
        raise SyncError(f"Snapshot request failed: HTTP {error.code}") from None
    except urllib.error.URLError as error:
        raise SyncError(f"Floreren unreachable: {error.reason}") from None


def _image_name(url: str) -> str:
    suffix = Path(url.split("?", 1)[0]).suffix.lower()
    if suffix not in {".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"}:
        suffix = ".img"
    return hashlib.sha256(url.encode("utf-8")).hexdigest()[:24] + suffix


def _download_image(url: str, images_dir: Path) -> str | None:
    """Local path relative to the output folder, or None when it failed.
    Photo URLs never change for the same photo, so a file on disk is final."""
    if not url.startswith(("https://", "http://")):
        return None
    name = _image_name(url)
    target = images_dir / name
    if not target.exists():
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(request, timeout=IMAGE_TIMEOUT_S) as response:
                _atomic_write(target, response.read())
        except (urllib.error.URLError, TimeoutError, OSError):
            return None
    return f"images/{name}"


def _download_thumbnail(url: str, map_id: int, token: str, snapshot_url: str, out: Path) -> str | None:
    """Map thumbnails come from the Floreren API and need the token, so it is
    only ever sent to the same host as the snapshot itself."""
    if not url or _origin(url) != _origin(snapshot_url):
        return None
    request = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {token}",
        "User-Agent": USER_AGENT,
    })
    try:
        with urllib.request.urlopen(request, timeout=IMAGE_TIMEOUT_S) as response:
            data = response.read()
    except (urllib.error.URLError, TimeoutError, OSError):
        return None
    name = f"thumbnails/map-{int(map_id)}.svg"
    _atomic_write(out / name, data)
    return name


def _localise_images(snapshot: dict[str, Any], images_dir: Path) -> None:
    """Add `local_image` next to every photo URL in the snapshot."""
    def visit(items: list[dict], key: str) -> None:
        for item in items:
            url = item.get(key)
            item["local_image"] = _download_image(url, images_dir) if url else None

    visit(snapshot.get("recent_photos", []), "url")
    visit(snapshot.get("plants", []), "photo_url")
    for bucket in ("overdue", "due_today", "upcoming"):
        visit(snapshot.get("care", {}).get(bucket, []), "photo_url")


def sync(out: Path, token: str, *, url: str = DEFAULT_URL, lang: str | None = None) -> dict[str, Any]:
    """Fetch (if changed), cache images, write snapshot.json. Returns the snapshot.

    On any failure the previous snapshot.json is left untouched, so LAveren can
    keep showing the last good data (check `generated_at` for staleness)."""
    out.mkdir(parents=True, exist_ok=True)
    etag_file = out / ".etag"
    snapshot_file = out / "snapshot.json"
    etag = etag_file.read_text().strip() if etag_file.exists() and snapshot_file.exists() else None

    body, new_etag = _fetch_snapshot(url, token, lang, etag)
    if body is None:
        return json.loads(snapshot_file.read_text(encoding="utf-8"))

    snapshot = json.loads(body)
    if snapshot.get("schema_version") != SUPPORTED_SCHEMA:
        raise SyncError(
            f"Snapshot schema {snapshot.get('schema_version')} is newer than this "
            f"script ({SUPPORTED_SCHEMA}); update floreren_sync.py."
        )
    _localise_images(snapshot, out / "images")
    for space in snapshot.get("maps", []):
        space["local_thumbnail"] = _download_thumbnail(
            space.get("thumbnail_url"), space.get("id", 0), token, url, out,
        )
    _atomic_write(snapshot_file, json.dumps(snapshot, ensure_ascii=False, indent=2).encode("utf-8"))
    if new_etag:
        _atomic_write(etag_file, new_etag.encode("ascii"))
    return snapshot


def mark_done(
    token: str,
    schedule_id: int,
    *,
    url: str = DEFAULT_URL,
    notes: str | None = None,
) -> dict[str, Any]:
    """Mark one care task done (a `schedule_id` from a snapshot care item).

    Returns {"ok", "schedule_id", "plant_id", "care_type", "next_due",
    "care_log_id"}. Call sync() afterwards: the server drops its cached
    snapshot for the household, so the next pull already shows it done."""
    payload = json.dumps({"schedule_id": int(schedule_id), "notes": notes}).encode("utf-8")
    request = urllib.request.Request(
        _endpoint(url, "/care/done"),
        data=payload,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": USER_AGENT,
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=SNAPSHOT_TIMEOUT_S) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as error:
        code = None
        try:
            code = (json.loads(error.read()).get("detail") or {}).get("code")
        except (ValueError, AttributeError):
            pass
        messages = {
            "integration_token_read_only": "This token is read-only. Make one with "
                                           "\"Also allow marking care as done\" ticked.",
            "integration_account_read_only": "Your Floreren account can no longer edit this household.",
            "care_schedule_not_found": "That care task no longer exists (done, deleted or archived). Re-sync.",
            "integration_token_invalid": "Token rejected (revoked, or the password was changed).",
        }
        raise SyncError(messages.get(code, f"Mark-done failed: HTTP {error.code}")) from None
    except urllib.error.URLError as error:
        raise SyncError(f"Floreren unreachable: {error.reason}") from None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n", 1)[0])
    parser.add_argument("--out", type=Path, default=Path("data/floreren"))
    parser.add_argument("--url", default=os.environ.get("FLOREREN_SNAPSHOT_URL", DEFAULT_URL))
    parser.add_argument("--lang", choices=("nl", "en"), default=os.environ.get("FLOREREN_LANG") or None)
    parser.add_argument("--done", type=int, metavar="SCHEDULE_ID",
                        help="mark this care task done, then re-sync")
    args = parser.parse_args(argv)

    token = os.environ.get("FLOREREN_TOKEN", "").strip()
    if not token.startswith("flo_"):
        print("Set FLOREREN_TOKEN to a token from Floreren → Settings → Connected dashboards.", file=sys.stderr)
        return 2
    try:
        if args.done is not None:
            result = mark_done(token, args.done, url=args.url)
            print(f"Done: {result.get('care_type')} for plant {result.get('plant_id')}, "
                  f"next due {result.get('next_due')}")
        snapshot = sync(args.out, token, url=args.url, lang=args.lang)
    except SyncError as error:
        print(f"floreren_sync: {error}", file=sys.stderr)
        return 1
    counts = snapshot.get("counts", {})
    print(
        f"{snapshot.get('household', {}).get('name')}: {counts.get('plants')} plants, "
        f"{counts.get('care_overdue')} overdue, {counts.get('care_due_today')} due today "
        f"(generated {snapshot.get('generated_at')})"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
