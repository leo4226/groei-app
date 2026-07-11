"""canonicalize persisted care type keys

Revision ID: 0039
Revises: 0038
"""
from alembic import op

revision = "0039"
down_revision = "0038"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # CASE updates are idempotent: rerunning leaves canonical rows untouched.
    for table in ("care_schedules", "care_log"):
        op.execute(f"""
            UPDATE {table}
            SET care_type = CASE care_type
                WHEN 'repot_check' THEN 'repot'
                WHEN 'protect_cold' THEN 'frost_protect'
                WHEN 'protect_heat' THEN 'heat_protect'
                ELSE care_type
            END
            WHERE care_type IN ('repot_check', 'protect_cold', 'protect_heat')
        """)


def downgrade() -> None:
    # Irreversible data cleanup: converting every canonical row back would also
    # rewrite rows created after this migration and reintroduce ambiguous keys.
    pass
