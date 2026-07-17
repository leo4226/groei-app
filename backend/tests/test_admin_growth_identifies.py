"""Admin growth metrics — plant-ID tracking + the date-key fix (issue: admin overview)."""
import pytest

BASE = "/api"


@pytest.mark.asyncio
async def test_growth_metrics_reports_identifies_and_top_households(client, seeded_db, auth_header):
    # growth-metrics also reads care_log (not in the base test schema); create an
    # empty one so the endpoint runs — this test only cares about identify_log.
    await seeded_db.execute("""
        CREATE TABLE IF NOT EXISTS care_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plant_id INTEGER, care_type TEXT, done_by INTEGER,
            done_at DATETIME, notes TEXT, skipped INTEGER DEFAULT 0
        )
    """)
    await seeded_db.execute("UPDATE accounts SET is_admin = 1 WHERE id = 1")
    for _ in range(3):
        await seeded_db.execute(
            "INSERT INTO identify_log (account_id, household_id, engine, outcome) "
            "VALUES (?, ?, ?, ?)",
            (1, 1, "bioclip", "high"),
        )
    await seeded_db.commit()

    res = await client.get(f"{BASE}/admin-panel/growth-metrics?days=30", headers=auth_header)
    assert res.status_code == 200, res.text
    body = res.json()

    # The new identifies series is present and its per-day counts total correctly
    # (this also exercises the date-key coercion — a bug would leave it at 0).
    assert "identifies" in body["metrics"]
    assert sum(p["count"] for p in body["metrics"]["identifies"]) == 3
    assert "identifies" in body["deltas"]

    # "By who" — the seeded household is surfaced with its count
    assert body["top_identifiers"] == [{"household": "Test Household", "count": 3}]


@pytest.mark.asyncio
async def test_growth_metrics_requires_admin(client, seeded_db, auth_header):
    # account 1 is not admin by default → 403
    res = await client.get(f"{BASE}/admin-panel/growth-metrics", headers=auth_header)
    assert res.status_code == 403
