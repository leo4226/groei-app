"""game: guest players, multi-map sessions, race pacing

Turns the garden game into something you can actually run at a party:

- Guests play without a Floreren account (`game_players.account_id` becomes
  nullable, with `display_name` carrying the name they typed).
- A session can span several maps, so an indoor plant and an outdoor one can
  appear in the same hunt (`game_session_maps`, plus `game_rounds.map_id` so
  each round knows where its plant lives).
- Race pacing: everyone gets the same clue at once and the round closes on a
  timer or once enough players have found it (`pacing`, `round_seconds`,
  `game_rounds.ends_at`, `game_answers.finish_rank`).
- Scan verification matches against every stored photo of the target plant,
  not just its profile shot (`target_embeddings` holds a JSON array).

Revision ID: 0072
Revises: 0071
Create Date: 2026-08-14

"""
from alembic import op

revision = "0072"
down_revision = "0071"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Guest players ────────────────────────────────────────────────────────
    # account_id becomes nullable; a row is either an account player or a guest.
    op.execute("ALTER TABLE game_players ALTER COLUMN account_id DROP NOT NULL")
    op.execute("ALTER TABLE game_players ADD COLUMN display_name TEXT")
    op.execute(
        "ALTER TABLE game_players ADD COLUMN is_guest BOOLEAN NOT NULL DEFAULT FALSE"
    )
    # Guest tokens are validated against this so a revoked/deleted player's
    # token stops working immediately.
    op.execute("ALTER TABLE game_players ADD COLUMN guest_secret TEXT")
    # The old UNIQUE (session_id, account_id) still holds for account players.
    # Postgres treats NULLs as distinct, so many guests per session are fine.
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_game_players_session ON game_players(session_id)"
    )

    # ── Multi-map sessions ───────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE game_session_maps (
            session_id  INTEGER NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
            map_id      INTEGER NOT NULL REFERENCES maps(id),
            PRIMARY KEY (session_id, map_id)
        )
    """)
    # Backfill existing sessions so they keep working through the new read path.
    op.execute(
        "INSERT INTO game_session_maps (session_id, map_id) "
        "SELECT id, map_id FROM game_sessions ON CONFLICT DO NOTHING"
    )
    # Each round remembers which map its plant is on, so the player UI can say
    # "this one is inside" without a join back through plants.
    op.execute("ALTER TABLE game_rounds ADD COLUMN map_id INTEGER REFERENCES maps(id)")
    op.execute("""
        UPDATE game_rounds gr
           SET map_id = gs.map_id
          FROM game_sessions gs
         WHERE gs.id = gr.session_id AND gr.map_id IS NULL
    """)

    # ── Race pacing ──────────────────────────────────────────────────────────
    op.execute(
        "ALTER TABLE game_sessions ADD COLUMN pacing VARCHAR(10) NOT NULL DEFAULT 'host'"
    )
    op.execute("ALTER TABLE game_sessions ADD COLUMN round_seconds INTEGER")
    op.execute("ALTER TABLE game_rounds ADD COLUMN ends_at TIMESTAMP")
    # Finish order within a round drives rank-based scoring in race mode.
    op.execute("ALTER TABLE game_answers ADD COLUMN finish_rank INTEGER")

    # ── Multi-reference embeddings ───────────────────────────────────────────
    # JSON array of base64 float32[512] vectors: every stored photo of the
    # target plant, so a guest photographing it from another angle still scores.
    op.execute("ALTER TABLE game_rounds ADD COLUMN target_embeddings TEXT")
    # Genus of the target, precomputed so a genus-level identify still counts.
    op.execute("ALTER TABLE game_rounds ADD COLUMN target_genus TEXT")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS game_session_maps")
    op.execute("ALTER TABLE game_rounds DROP COLUMN IF EXISTS target_genus")
    op.execute("ALTER TABLE game_rounds DROP COLUMN IF EXISTS target_embeddings")
    op.execute("ALTER TABLE game_rounds DROP COLUMN IF EXISTS ends_at")
    op.execute("ALTER TABLE game_rounds DROP COLUMN IF EXISTS map_id")
    op.execute("ALTER TABLE game_answers DROP COLUMN IF EXISTS finish_rank")
    op.execute("ALTER TABLE game_sessions DROP COLUMN IF EXISTS round_seconds")
    op.execute("ALTER TABLE game_sessions DROP COLUMN IF EXISTS pacing")
    op.execute("ALTER TABLE game_players DROP COLUMN IF EXISTS guest_secret")
    op.execute("ALTER TABLE game_players DROP COLUMN IF EXISTS is_guest")
    op.execute("ALTER TABLE game_players DROP COLUMN IF EXISTS display_name")
