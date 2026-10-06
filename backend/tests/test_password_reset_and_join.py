"""Password reset links and household invites: the paths that grant access."""
from datetime import datetime, timedelta

import pytest
import pytest_asyncio

import routers.auth as auth_router
from auth import hash_password
from routers.auth import hash_reset_token


RESET_SCHEMA = """
    CREATE TABLE password_reset_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER NOT NULL,
        token TEXT NOT NULL UNIQUE,
        expires_at DATETIME NOT NULL,
        used_at DATETIME
    );
"""


@pytest_asyncio.fixture
async def reset_db(seeded_db, monkeypatch):
    await seeded_db.executescript(RESET_SCHEMA)
    await seeded_db.execute(
        "UPDATE accounts SET email = 'leon@example.com', password_hash = ? WHERE id = 1",
        (hash_password("old-password"),),
    )
    await seeded_db.commit()
    sent: list[str] = []
    monkeypatch.setattr(
        auth_router, "send_password_reset",
        lambda email, link, lang="nl": sent.append(link) or True,
    )
    return seeded_db, sent


def _token_from(link: str) -> str:
    return link.split("token=", 1)[1]


@pytest.mark.asyncio
async def test_reset_link_is_stored_only_as_a_digest(client, reset_db):
    db, sent = reset_db
    response = await client.post(
        "/api/auth/forgot-password", json={"email": "leon@example.com"},
    )

    assert response.status_code == 200
    raw = _token_from(sent[0])
    rows = await db.execute_fetchall("SELECT token FROM password_reset_tokens")
    assert rows[0]["token"] == hash_reset_token(raw)
    assert raw not in rows[0]["token"]


@pytest.mark.asyncio
async def test_reset_spends_its_link_and_every_older_one(client, reset_db):
    db, sent = reset_db
    for _ in range(2):
        await client.post("/api/auth/forgot-password", json={"email": "leon@example.com"})
    older, newer = (_token_from(link) for link in sent)

    used = await client.post(
        "/api/auth/reset-password",
        json={"token": newer, "new_password": "new-password-1"},
    )
    assert used.status_code == 200, used.text

    for token in (newer, older):
        again = await client.post(
            "/api/auth/reset-password",
            json={"token": token, "new_password": "attacker-password"},
        )
        assert again.status_code == 400

    login = await client.post(
        "/api/auth/login",
        json={"email": "leon@example.com", "password": "new-password-1"},
    )
    assert login.status_code == 200


@pytest.mark.asyncio
async def test_short_password_does_not_spend_the_link(client, reset_db):
    _, sent = reset_db
    await client.post("/api/auth/forgot-password", json={"email": "leon@example.com"})
    token = _token_from(sent[0])

    short = await client.post(
        "/api/auth/reset-password", json={"token": token, "new_password": "short"},
    )
    good = await client.post(
        "/api/auth/reset-password", json={"token": token, "new_password": "long-enough-1"},
    )

    assert short.status_code == 400
    assert good.status_code == 200


@pytest.mark.asyncio
async def test_login_ignores_surrounding_whitespace_in_email(client, reset_db):
    response = await client.post(
        "/api/auth/login",
        json={"email": " Leon@Example.com ", "password": "old-password"},
    )

    assert response.status_code == 200


async def _invite(db, code: str = "ABCDEF") -> None:
    await db.execute(
        "INSERT INTO household_invites (household_id, code, created_by, expires_at, role) "
        "VALUES (1, ?, 1, ?, 'editor')",
        (code, datetime.utcnow() + timedelta(days=1)),
    )
    await db.commit()


def _join(code: str, email: str, name: str) -> dict:
    return {
        "code": code, "email": email, "password": "joiner-password",
        "name": name, "language": "en",
    }


@pytest.mark.asyncio
async def test_invite_code_admits_one_account_only(client, seeded_db):
    await _invite(seeded_db)

    first = await client.post("/api/household/join", json=_join("abcdef", "a@example.com", "Ann"))
    second = await client.post("/api/household/join", json=_join("ABCDEF", "b@example.com", "Bob"))

    assert first.status_code == 200, first.text
    assert second.status_code == 410
    accounts = await seeded_db.execute_fetchall(
        "SELECT email FROM accounts WHERE household_id = 1 ORDER BY id"
    )
    assert [row["email"] for row in accounts][-1] == "a@example.com"
    profile = await seeded_db.execute_fetchall(
        "SELECT u.account_id FROM users u JOIN accounts a ON a.id = u.account_id "
        "WHERE a.email = 'a@example.com'"
    )
    assert len(profile) == 1


@pytest.mark.asyncio
async def test_guessing_invite_codes_is_rate_limited(client, seeded_db):
    statuses = [
        (await client.post(
            "/api/household/join",
            json=_join(f"WRONG{index}", f"g{index}@example.com", f"G{index}"),
        )).status_code
        for index in range(11)
    ]

    assert statuses[:10] == [404] * 10
    assert statuses[10] == 429


@pytest.mark.asyncio
async def test_blank_names_are_refused_at_signup_and_join(client, seeded_db):
    await _invite(seeded_db, "BLANKS")
    signup = await client.post("/api/auth/register", json={
        "email": "blank@example.com", "password": "long-enough-1", "name": "   ",
    })
    join = await client.post("/api/household/join", json=_join("BLANKS", "j@example.com", "  "))

    assert signup.status_code == 422
    assert join.status_code == 422


@pytest.mark.asyncio
async def test_reset_link_carries_the_email_language_and_errors_are_codes(client, reset_db):
    db, sent = reset_db
    await db.execute("UPDATE accounts SET language = 'en' WHERE id = 1")
    await db.commit()
    await client.post("/api/auth/forgot-password", json={"email": "leon@example.com"})

    assert "/reset-password?lang=en&token=" in sent[0]
    bogus = await client.post(
        "/api/auth/reset-password", json={"token": "nope", "new_password": "long-enough-1"},
    )
    short = await client.post(
        "/api/auth/reset-password", json={"token": "nope", "new_password": "short"},
    )
    assert bogus.json()["detail"] == {"code": "reset_link_invalid"}
    assert short.json()["detail"] == {"code": "password_too_short"}


@pytest.mark.asyncio
async def test_reset_signs_out_every_existing_session(client, reset_db):
    _, sent = reset_db
    login = await client.post(
        "/api/auth/login", json={"email": "leon@example.com", "password": "old-password"},
    )
    stolen = {"Authorization": f"Bearer {login.json()['token']}"}
    assert (await client.get("/api/auth/me", headers=stolen)).status_code == 200

    await client.post("/api/auth/forgot-password", json={"email": "leon@example.com"})
    reset = await client.post(
        "/api/auth/reset-password",
        json={"token": _token_from(sent[0]), "new_password": "new-password-1"},
    )
    assert reset.status_code == 200

    assert (await client.get("/api/auth/me", headers=stolen)).status_code == 401
    fresh = await client.post(
        "/api/auth/login", json={"email": "leon@example.com", "password": "new-password-1"},
    )
    me = await client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {fresh.json()['token']}"},
    )
    assert me.status_code == 200


@pytest.mark.asyncio
async def test_change_password_keeps_this_device_and_ends_the_others(client, reset_db):
    tokens = [
        (await client.post(
            "/api/auth/login",
            json={"email": "leon@example.com", "password": "old-password"},
        )).json()["token"]
        for _ in range(2)
    ]
    phone, laptop = ({"Authorization": f"Bearer {t}"} for t in tokens)

    changed = await client.post(
        "/api/auth/change-password",
        json={"current_password": "old-password", "new_password": "new-password-1"},
        headers=phone,
    )

    assert changed.status_code == 200, changed.text
    renewed = {"Authorization": f"Bearer {changed.json()['token']}"}
    assert (await client.get("/api/auth/me", headers=renewed)).status_code == 200
    assert (await client.get("/api/auth/me", headers=laptop)).status_code == 401
    assert (await client.get("/api/auth/me", headers=phone)).status_code == 401


@pytest.mark.asyncio
async def test_tokens_from_before_session_versions_still_work(client, reset_db):
    from datetime import timezone
    from jose import jwt
    from auth import ALGORITHM, SECRET

    legacy = jwt.encode(
        {"sub": "1", "household_id": 1, "exp": datetime.now(timezone.utc) + timedelta(days=1)},
        SECRET, algorithm=ALGORITHM,
    )
    me = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {legacy}"})
    assert me.status_code == 200
