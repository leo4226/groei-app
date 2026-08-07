"""backfill what 0063's container columns can honestly be derived from

0063 added form_type, pot_material, pot_diameter_cm, pot_height_cm,
has_drainage, substrate and acquired_from. Every plant created before it has
them all NULL.

Only two can be filled without guessing:

  - form_type, from icon_key. A `_bare` suffix means the plant is drawn
    without a pot, i.e. planted in the ground; anything else is potted. This is
    the same rule EditPlant already uses to initialise its Potted/Bare toggle,
    so it is a restatement of existing behaviour rather than an inference.
  - pot_diameter_cm, from pot_size_cm. They are the same measurement — the
    create path already writes pot_size_cm from the diameter the form asks for,
    and this is that mapping applied backwards.

pot_material, pot_height_cm, has_drainage, substrate and acquired_from are
physical facts about one specific pot in someone's home. There is no
species-level source for them and a plausible-looking default ("probably
terracotta") would feed wrong data to care advice, so they stay NULL. The API
and UI already treat NULL as "not answered yet"; the owner fills them in from
the plant's edit screen.

Only rows still NULL are touched, so re-running is safe and nothing a user has
already entered is overwritten.

Revision ID: 0064
Revises: 0063
Create Date: 2026-08-07
"""
from alembic import op

revision = "0064"
down_revision = "0063"
branch_labels = None
depends_on = None


#: Kept as data (rather than inline in `upgrade`) so the backfill rules can be
#: executed and asserted from tests — see tests/test_container_backfill.py.
#: Order matters: the `_bare` rule must run before the catch-all potted rule.
BACKFILL_STATEMENTS = (
    # Ground-planted: the icon has no pot drawn.
    r"""
    UPDATE plants
       SET form_type = 'ground'
     WHERE form_type IS NULL
       AND icon_key LIKE '%\_bare' ESCAPE '\'
    """,
    # Everything else with a known icon is potted.
    """
    UPDATE plants
       SET form_type = 'pot'
     WHERE form_type IS NULL
       AND icon_key IS NOT NULL
    """,
    # Same measurement under two names.
    """
    UPDATE plants
       SET pot_diameter_cm = pot_size_cm
     WHERE pot_diameter_cm IS NULL
       AND pot_size_cm IS NOT NULL
    """,
)


def upgrade() -> None:
    for statement in BACKFILL_STATEMENTS:
        op.execute(statement)


def downgrade() -> None:
    # There is no way to tell a backfilled value from one the user typed, so
    # this deliberately does not try to unpick it. 0063's downgrade drops the
    # columns outright if that is really what is wanted.
    pass
