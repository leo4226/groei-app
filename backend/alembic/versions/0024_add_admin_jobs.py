"""add admin_jobs table"""

revision = "0024"
down_revision = "0023"

from alembic import op


def upgrade():
    op.execute("""
        CREATE TABLE IF NOT EXISTS admin_jobs (
            id SERIAL PRIMARY KEY,
            account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
            kind TEXT NOT NULL,
            params JSONB,
            status TEXT NOT NULL DEFAULT 'pending',
            progress_done INTEGER NOT NULL DEFAULT 0,
            progress_total INTEGER NOT NULL DEFAULT 0,
            result JSONB,
            error TEXT,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_admin_jobs_created ON admin_jobs(created_at DESC)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_admin_jobs_status ON admin_jobs(status)")


def downgrade():
    op.execute("DROP TABLE IF EXISTS admin_jobs")
