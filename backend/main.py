import logging
import traceback
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path
import os
import asyncio

logging.basicConfig(level=logging.INFO)
_log = logging.getLogger("floreren")

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from database import init_pool, close_pool, get_db
from routers import users, locations, plants, objects, care, dashboard, maps, ground_zones
from routers import plant_care, species, spots, icons
from routers import admin, alerts, weed_catalog, weed_sightings, auth, calendar
from routers import admin_panel
from routers import warnings as warnings_router
from routers import plant_id as plant_id_router
from routers import household
from routers import weather as weather_router
from routers import chat as chat_router
from routers import bug_report as bug_report_router
from routers import notifications as notifications_router
from routers import plant_photos as plant_photos_router
from routers import watchdog as watchdog_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_pool()

    # Preload BioCLIP in background (first load downloads from HF Hub, ~60s).
    # Skipped when BIOCLIP_WORKER_URL is set — on Fly we offload to the remote
    # GPU worker and don't ship torch/open_clip in the image.
    async def _preload_bioclip():
        try:
            from services.bioclip_id import get_service

            def _load():
                svc = get_service()
                svc.load_model()
                svc.load_embeddings()
                return svc

            loop = asyncio.get_event_loop()
            svc = await loop.run_in_executor(None, _load)
            _log.info("BioCLIP preloaded: %d species on %s", len(svc._species_ids), svc._device)
        except Exception as exc:
            _log.warning("BioCLIP preload failed (lazy-load on request): %s", exc)

    if not os.environ.get("BIOCLIP_WORKER_URL"):
        asyncio.ensure_future(_preload_bioclip())

    yield
    await close_pool()


app = FastAPI(title="Floreren", version="0.1.0", lifespan=lifespan)

_origins = os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_origin_regex=r"https://.*\.vercel\.app|https://floreren\.app|https://www\.floreren\.app|https://.*fly\.dev",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global exception handler — catches all unhandled exceptions so the API
# always returns a proper JSON error with CORS headers instead of a raw 500.
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    _log.error("Unhandled exception: %s", exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
        headers={"Access-Control-Allow-Origin": "*"},
    )

# Health check for Fly.io — pings DB to catch silent connection-pool issues.
@app.get("/health")
async def health():
    async with get_db() as db:
        await db.execute_fetchall("SELECT 1")
    return {"status": "ok"}


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
app.include_router(admin_panel.router, prefix="/api")
app.include_router(alerts.router, prefix="/api")
app.include_router(weed_catalog.router, prefix="/api")
app.include_router(weed_sightings.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(calendar.router, prefix="/api")
app.include_router(warnings_router.router, prefix="/api")
app.include_router(plant_id_router.router, prefix="/api")
app.include_router(household.router, prefix="/api")
app.include_router(weather_router.router, prefix="/api")
app.include_router(chat_router.router, prefix="/api")
app.include_router(bug_report_router.router, prefix="/api")
app.include_router(notifications_router.router, prefix="/api")
app.include_router(plant_photos_router.router, prefix="/api")
app.include_router(watchdog_router.router, prefix="/api")

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
