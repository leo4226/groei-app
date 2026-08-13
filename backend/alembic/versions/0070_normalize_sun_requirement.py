"""collapse plants.sun_requirement onto the three canonical values (#886)

The Add/Edit Plant forms offered five light tiles — dark, shade, indirect,
bright, full-sun — but only three of them had a mapping to a stored value.
Picking "dark" or "bright" persisted that literal string, which matches no
entry in PLANT_SUN_PROFILES / the species `sun_preference` vocabulary, so
`getSunFit` returned null and the sun-fit card silently disappeared from the
plant passport, the map quick sheet and the marker's fit ring.

The forms now offer exactly `shade | partial_sun | full_sun`. This rewrites the
rows already carrying a legacy value:

    dark      -> shade         (less light than shade, same bucket)
    bright    -> partial_sun   (10-25k lx is bright *indirect*, not direct sun)
    indirect  -> partial_sun   (retired tile spelling)
    full-sun  -> full_sun      (retired tile spelling)

Anything else unrecognised is left alone rather than guessed at.

Revision ID: 0070
Revises: 0069
Create Date: 2026-08-13
"""
from alembic import op

revision = "0070"
down_revision = "0069"
branch_labels = None
depends_on = None


LEGACY_TO_CANONICAL = {
    "dark": "shade",
    "bright": "partial_sun",
    "indirect": "partial_sun",
    "full-sun": "full_sun",
}


def upgrade() -> None:
    for legacy, canonical in LEGACY_TO_CANONICAL.items():
        op.execute(
            "UPDATE plants SET sun_requirement = '%s' WHERE sun_requirement = '%s'"
            % (canonical, legacy)
        )


def downgrade() -> None:
    # Not reversible: `partial_sun` now covers rows that were `indirect` and
    # rows that were `bright`, and nothing recorded which was which. The
    # canonical values are valid input for the old form too, so leaving them is
    # the safe downgrade.
    pass
