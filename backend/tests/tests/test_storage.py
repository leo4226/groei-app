# groei/backend/tests/test_storage.py
import io
import os
import pytest
from services.storage import Storage, build_storage_from_env


def test_build_from_env_returns_storage(monkeypatch):
    monkeypatch.setenv("R2_ACCOUNT_ID", "x")
    monkeypatch.setenv("R2_ACCESS_KEY_ID", "y")
    monkeypatch.setenv("R2_SECRET_ACCESS_KEY", "z")
    monkeypatch.setenv("R2_BUCKET", "b")
    monkeypatch.setenv("R2_PUBLIC_BASE_URL", "https://cdn.example.com")
    s = build_storage_from_env()
    assert isinstance(s, Storage)
    assert s.public_base_url == "https://cdn.example.com"


def test_public_url_combines_base_and_key():
    s = Storage(client=None, bucket="b", public_base_url="https://cdn.example.com")
    assert s.public_url("photos/1.png") == "https://cdn.example.com/photos/1.png"


def test_public_url_strips_trailing_slash_from_base():
    s = Storage(client=None, bucket="b", public_base_url="https://cdn.example.com/")
    assert s.public_url("photos/1.png") == "https://cdn.example.com/photos/1.png"
