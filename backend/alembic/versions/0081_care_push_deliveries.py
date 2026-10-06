"""Track care-push delivery per account, not per household.

`care_schedules.notified_for_due` recorded that a push went out for a
schedule's current due date. The schedule is shared by the whole household, so
the first member reached settled it for everyone: a member still in their
quiet hours, or whose phone was unreachable that run, never heard about the
task at all. This table records it per account instead.

Backfill: every subscribed account in the household is marked as notified for
schedules that were already stamped for their current due date (and are not
snoozed), so the deploy does not re-send reminders people have already had.
`notified_for_due` is left in place but no longer read or written by the
dispatch.

Revision ID: 0081
Revises: 0080
Create Date: 2026-10-06
"""
from alembic import op

revision = "0081"
down_revision = "0080"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS care_push_deliveries (
            account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            schedule_id INTEGER NOT NULL REFERENCES care_schedules(id) ON DELETE CASCADE,
            -- The due date this account was told about. A later due date (the
            -- task was done and fell due again, or rain moved it) no longer
            -- matches, so it is pushed again.
            notified_for_due DATE NOT NULL,
            notified_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (account_id, schedule_id)
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_care_push_deliveries_schedule "
        "ON care_push_deliveries (schedule_id)"
    )
    op.execute(
        """
        INSERT INTO care_push_deliveries (account_id, schedule_id, notified_for_due)
        SELECT DISTINCT a.id, cs.id, cs.notified_for_due
        FROM care_schedules cs
        JOIN plants p ON p.id = cs.plant_id
        JOIN accounts a ON a.household_id = p.household_id
        JOIN push_subscriptions ps ON ps.account_id = a.id
        WHERE cs.notified_for_due IS NOT NULL
          AND cs.notified_for_due = cs.next_due
          AND cs.snoozed_until IS NULL
        ON CONFLICT DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS care_push_deliveries")
