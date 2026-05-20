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

from database import init_pool, close_pool
from routers import users, locations, plants, objects, care, dashboard, maps, ground_zones
from routers import plant_care, species, spots, icons
from routers import admin, alerts, weed_catalog, weed_sightings, auth, calendar
from routers import warnings as warnings_router
from routers import plant_id as plant_id_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_pool()
    yield
    await close_pool()


app = FastAPI(title="Floreren", version="0.1.0", lifespan=lifespan)

_origins = os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_origin_regex=r"https://.*\.vercel\.app|https://floreren\.app|https://www\.floreren\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
app.include_router(warnings_router.router, prefix="/api")
app.include_router(plant_id_router.router, prefix="/api")

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
