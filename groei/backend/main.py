from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path
import os

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from database import init_db
from routers import users, locations, plants, objects, care, dashboard, maps, ground_zones
from routers import plant_care, species, spots, icons
from routers import admin, alerts, weed_catalog, weed_sightings, auth, calendar


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="Floreren", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve uploaded photos
photos_dir = os.path.join(os.path.dirname(__file__), "photos")
app.mount("/api/photos", StaticFiles(directory=photos_dir), name="photos")

# Serve map SVGs
maps_dir = os.path.join(os.path.dirname(__file__), "static", "maps")
app.mount("/api/maps-static", StaticFiles(directory=maps_dir), name="maps-static")

# Serve plant icons
icons_dir = os.path.join(os.path.dirname(__file__), "..", "icons")
app.mount("/api/icons", StaticFiles(directory=icons_dir), name="icons")

# Mount routers
app.include_router(users.router, prefix="/api")
app.include_router(locations.router, prefix="/api")
app.include_router(plants.router, prefix="/api")
app.include_router(objects.router, prefix="/api")
app.include_router(care.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")
app.include_router(maps.router, prefix="/api")
app.include_router(ground_zones.router, prefix="/api")
app.include_router(plant_care.router, prefix="/api")
app.include_router(species.router, prefix="/api")
app.include_router(spots.router, prefix="/api")
app.include_router(icons.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(alerts.router, prefix="/api")
app.include_router(weed_catalog.router, prefix="/api")
app.include_router(weed_sightings.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(calendar.router, prefix="/api")

# Serve the built frontend (production mode)
_frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"

if _frontend_dist.exists():
    app.mount("/assets", StaticFiles(directory=_frontend_dist / "assets"), name="frontend-assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        candidate = _frontend_dist / full_path
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(_frontend_dist / "index.html")
