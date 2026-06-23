"""Add admin_audit_log table

Revision ID: 0023
Revises: 0022
Create Date: 2026-06-23
"""
from alembic import op

revision = "0023"
down_revision = "0022"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE TABLE IF NOT EXISTS admin_audit_log (
            id SERIAL PRIMARY KEY,
            account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
            action TEXT NOT NULL,
            target TEXT,
            detail JSONB,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
    """)
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created ON admin_audit_log(created_at DESC)"
    )


def downgrade():
    op.execute("DROP TABLE IF EXISTS admin_audit_log")
