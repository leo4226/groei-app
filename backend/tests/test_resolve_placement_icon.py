import pytest
from routers.icons import resolve_placement_icon


@pytest.mark.asyncio
async def test_uses_generated_bare_variant(seeded_db):
    await seeded_db.execute("""CREATE TABLE generated_icons (
        id TEXT PRIMARY KEY, name TEXT, sci TEXT, cat TEXT, form TEXT,
        variant_of TEXT, family TEXT, url TEXT, source TEXT, created_at TEXT)""")
    await seeded_db.execute("INSERT INTO generated_icons (id,name,form,url,source) "
                            "VALUES ('gen_rosa','Roos','potted','u','ai')")
    await seeded_db.execute("INSERT INTO generated_icons (id,name,form,variant_of,url,source) "
                            "VALUES ('gen_rosa_bare','Roos','bare','gen_rosa','u','ai')")
    await seeded_db.commit()
    # Not in a container -> bare form expected.
    assert await resolve_placement_icon(seeded_db, "gen_rosa", container_id=None) == "gen_rosa_bare"
    assert await resolve_placement_icon(seeded_db, "gen_rosa", container_id=5) == "gen_rosa"
