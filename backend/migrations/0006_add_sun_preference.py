"""Add sun_preference column to plant_species (SQLite dev path)."""
from yoyo import step

step("ALTER TABLE plant_species ADD COLUMN sun_preference TEXT")
