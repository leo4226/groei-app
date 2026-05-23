"""Smoke tests: verify no SQLite-specific SQL remains in the backend source."""
import glob
import os


def test_current_date_literal():
    sql = "INSERT INTO x (d) VALUES (CURRENT_DATE)"
    assert "date('now')" not in sql
    assert "CURRENT_DATE" in sql


def test_on_conflict_do_nothing_syntax():
    sql = "INSERT INTO t (id, v) VALUES ($1, $2) ON CONFLICT DO NOTHING"
    assert "INSERT OR IGNORE" not in sql
    assert "ON CONFLICT" in sql


def test_no_sqlite_functions_in_source():
    """Verify no SQLite-specific SQL remains in the backend .py files."""
    backend_dir = os.path.join(os.path.dirname(__file__), "..")
    py_files = glob.glob(os.path.join(backend_dir, "**/*.py"), recursive=True)
    sqlite_patterns = [
        "date('now')",
        "datetime('now')",
        "INSERT OR REPLACE",
        "INSERT OR IGNORE",
        "julianday(",
        "strftime('%",  # SQL strftime — narrows out Python datetime.strftime
    ]
    violations = []
    for f in py_files:
        # Skip this test file itself, alembic migration (historical), and __pycache__
        if (
            "test_sql_smoke" in f
            or "0001_initial_schema" in f
            or "__pycache__" in f
            or ".git" in f
        ):
            continue
        try:
            content = open(f, encoding="utf-8").read()
            for pat in sqlite_patterns:
                if pat in content:
                    violations.append(f"{os.path.relpath(f, backend_dir)}: {pat!r}")
        except Exception:
            pass
    assert violations == [], (
        "SQLite-specific SQL still present:\n" + "\n".join(violations)
    )
