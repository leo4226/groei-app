from pathlib import Path


MIGRATIONS = Path(__file__).parents[1] / "alembic" / "versions"


def test_water_interval_source_migration_is_explicit_and_constrained():
    matches = list(MIGRATIONS.glob("0049_*water*interval*source*.py"))
    assert len(matches) == 1

    source = matches[0].read_text(encoding="utf-8")
    assert 'revision = "0049"' in source
    assert 'down_revision = "0048"' in source
    assert "interval_source" in source
    assert "provisional" in source
    assert "species" in source
    assert "manual" in source
    assert "NOT VALID" in source
    assert "VALIDATE CONSTRAINT" in source
    assert "CHECK (interval_source IS NOT NULL)" in source
    assert "SET NOT NULL" in source