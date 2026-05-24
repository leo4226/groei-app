# Floreren/Dockerfile — build context is project root, includes backend + icons
FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# System deps for psycopg2 build
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install -r requirements.txt

COPY backend/ .
COPY frontend/public/icons /app/icons/

EXPOSE 8000

# Migrations run via fly.toml's [deploy] release_command, not here, so a
# failed migration aborts the deploy cleanly instead of crashing all machines.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
