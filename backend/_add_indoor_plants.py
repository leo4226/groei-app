import sqlite3, json

conn = sqlite3.connect('floreren.db')

# 1. Assign Drakenbloedboom to Huis map
conn.execute(
    "UPDATE plants SET map_id=7, map_x=300, map_y=200, container_id=1, is_locked=0 WHERE id=54"
)
print("Drakenbloedboom -> Huis map (x=300, y=200, container=1)")

# 2. Add a Monstera
monstera_profile = json.dumps({
    "water": {"active": True, "interval_days": 7, "season_adjust": {"spring": 1.0, "summer": 0.7, "autumn": 1.0, "winter": 1.5}},
    "fertilize": {"active": True, "interval_days": 30, "season_adjust": {"spring": 1.0, "summer": 1.0, "autumn": 1.0, "winter": None}, "months": [4,5,6,7,8,9]},
    "mist": {"active": True, "interval_days": 3, "season_adjust": {"spring": 1.0, "summer": 0.7, "autumn": 1.0, "winter": 2.0}},
    "rotate": {"active": True, "interval_days": 7},
    "dust": {"active": True, "interval_days": 30},
})
monstera_thresholds = json.dumps({"drought_mm_per_week": 5, "waterlog_mm_per_week": 15})
conn.execute(
    "INSERT INTO plants (name, species, map_id, map_x, map_y, container_id, is_active, household_id, icon_key, phase, pot_size_cm, care_profile, care_thresholds) VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?, ?, ?)",
    ("Monstera", "Monstera deliciosa", 7, 500, 250, 1, "leaf", "mature", 25, monstera_profile, monstera_thresholds)
)
print("Monstera added -> Huis map (x=500, y=250)")

# 3. Add a Vrouwentong (Sansevieria)
sansev_profile = json.dumps({
    "water": {"active": True, "interval_days": 14, "season_adjust": {"spring": 0.9, "summer": 0.7, "autumn": 0.9, "winter": 1.5}},
    "fertilize": {"active": True, "interval_days": 60, "season_adjust": {"spring": 1.0, "summer": 1.0, "autumn": 1.0, "winter": None}, "months": [4,5,6,7,8,9]},
    "dust": {"active": True, "interval_days": 60},
})
sansev_thresholds = json.dumps({"drought_mm_per_week": 3, "waterlog_mm_per_week": 12})
conn.execute(
    "INSERT INTO plants (name, species, map_id, map_x, map_y, container_id, is_active, household_id, icon_key, phase, pot_size_cm, care_profile, care_thresholds) VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?, ?, ?)",
    ("Vrouwentong", "Sansevieria trifasciata", 7, 150, 300, 1, "leaf", "mature", 18, sansev_profile, sansev_thresholds)
)
print("Vrouwentong added -> Huis map (x=150, y=300)")

# Check canvas_data for room info
canvas = conn.execute("SELECT canvas_data FROM maps WHERE id=7").fetchone()
if canvas and canvas[0]:
    data = json.loads(canvas[0])
    zones = data.get("zones", [])
    print(f"\nRooms in Huis canvas ({len(zones)}):")
    for z in zones:
        print(f"  {z.get('name','?')} x={z.get('x')} y={z.get('y')} w={z.get('w')} h={z.get('h')}")

conn.commit()
conn.close()
print("\nDone! 3 plants now on Huis map.")
