"""track ownership of Water schedule intervals

Revision ID: 0049
Revises: 0048
"""
from alembic import op

revision = "0049"
down_revision = "0048"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # A constant default lets PostgreSQL add the column without rewriting the
    # table. Existing schedules are user-owned unless explicitly created by
    # the new onboarding flow.
    op.execute("""
        ALTER TABLE care_schedules
        ADD COLUMN interval_source TEXT DEFAULT 'manual'
    """)
    op.execute("""
        ALTER TABLE care_schedules
        ADD CONSTRAINT ck_care_schedules_interval_source
        CHECK (interval_source IN ('provisional', 'species', 'manual'))
        NOT VALID
    """)
    op.execute("""
        ALTER TABLE care_schedules
        VALIDATE CONSTRAINT ck_care_schedules_interval_source
    """)
    op.execute("""
        ALTER TABLE care_schedules
        ADD CONSTRAINT ck_care_schedules_interval_source_not_null
        CHECK (interval_source IS NOT NULL)
        NOT VALID
    """)
    op.execute("""
        ALTER TABLE care_schedules
        VALIDATE CONSTRAINT ck_care_schedules_interval_source_not_null
    """)
    op.execute("""
        ALTER TABLE care_schedules
        ALTER COLUMN interval_source SET NOT NULL
    """)
    op.execute("""
        ALTER TABLE care_schedules
        DROP CONSTRAINT ck_care_schedules_interval_source_not_null
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE care_schedules
        DROP CONSTRAINT IF EXISTS ck_care_schedules_interval_source
    """)
    op.execute("""
        ALTER TABLE care_schedules
        DROP COLUMN IF EXISTS interval_source
    """)
