     1|from contextlib import asynccontextmanager
     2|from fastapi import FastAPI
     3|from fastapi.middleware.cors import CORSMiddleware
     4|from fastapi.staticfiles import StaticFiles
     5|from fastapi.responses import FileResponse
     6|from pathlib import Path
     7|import os
     8|
     9|try:
    10|    from dotenv import load_dotenv
    11|    load_dotenv()
    12|except ImportError:
    13|    pass
    14|
    15|from database import init_db
    16|from routers import users, locations, plants, objects, care, dashboard, maps, ground_zones
    17|from routers import plant_care, species, spots, icons
    18|from routers import admin, alerts, weed_catalog, weed_sightings, auth
    19|
    20|
    21|@asynccontextmanager
    22|async def lifespan(app: FastAPI):
    23|    await init_db()
    24|    yield
    25|
    26|
    27|app = FastAPI(title="Floreren", version="0.1.0", lifespan=lifespan)
    28|
    29|app.add_middleware(
    30|    CORSMiddleware,
    31|    allow_origins=["http://localhost:5173", "http://localhost:8000"],
    32|    allow_credentials=True,
    33|    allow_methods=["*"],
    34|    allow_headers=["*"],
    35|)
    36|
    37|# Serve uploaded photos
    38|photos_dir = os.path.join(os.path.dirname(__file__), "photos")
    39|app.mount("/api/photos", StaticFiles(directory=photos_dir), name="photos")
    40|
    41|# Serve map SVGs
    42|maps_dir = os.path.join(os.path.dirname(__file__), "static", "maps")
    43|app.mount("/api/maps-static", StaticFiles(directory=maps_dir), name="maps-static")
    44|
    45|# Serve plant icons
    46|icons_dir = os.path.join(os.path.dirname(__file__), "..", "icons")
    47|app.mount("/api/icons", StaticFiles(directory=icons_dir), name="icons")
    48|
    49|# Mount routers
    50|app.include_router(users.router, prefix="/api")
    51|app.include_router(locations.router, prefix="/api")
    52|app.include_router(plants.router, prefix="/api")
    53|app.include_router(objects.router, prefix="/api")
    54|app.include_router(care.router, prefix="/api")
    55|app.include_router(dashboard.router, prefix="/api")
    56|app.include_router(maps.router, prefix="/api")
    57|app.include_router(ground_zones.router, prefix="/api")
    58|app.include_router(plant_care.router, prefix="/api")
    59|app.include_router(species.router, prefix="/api")
    60|app.include_router(spots.router, prefix="/api")
    61|app.include_router(icons.router, prefix="/api")
    62|app.include_router(admin.router, prefix="/api")
    63|app.include_router(alerts.router, prefix="/api")
    64|app.include_router(weed_catalog.router, prefix="/api")
    65|app.include_router(weed_sightings.router, prefix="/api")
    66|app.include_router(auth.router, prefix="/api")
    67|
    68|# Serve the built frontend (production mode)
    69|_frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
    70|
    71|if _frontend_dist.exists():
    72|    app.mount("/assets", StaticFiles(directory=_frontend_dist / "assets"), name="frontend-assets")
    73|
    74|    @app.get("/{full_path:path}")
    75|    async def serve_frontend(full_path: str):
    76|        candidate = _frontend_dist / full_path
    77|        if candidate.is_file():
    78|            return FileResponse(candidate)
    79|        return FileResponse(_frontend_dist / "index.html")
    80|