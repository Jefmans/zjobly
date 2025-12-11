import logging
from fastapi import FastAPI

from app.config import settings
from app.database import engine
from app.models import Base
from app.routes import accounts
from app.routes import media
from app.storage import ensure_bucket


def create_app() -> FastAPI:
    app = FastAPI(
        title="Media API",
        version="0.1.0",
        root_path=settings.API_ROOT_PATH or None,
    )

    @app.get("/health", tags=["system"])
    async def health() -> dict:
        return {"status": "ok"}

    app.include_router(media.router, prefix=settings.API_PREFIX)
    app.include_router(accounts.router, prefix=settings.API_PREFIX)
    return app


app = create_app()


@app.on_event("startup")
async def startup_event() -> None:
    # Auto-create tables for early development; replace with migrations later.
    Base.metadata.create_all(bind=engine)
    # Make sure required buckets exist in MinIO.
    ensure_bucket(settings.S3_BUCKET_RAW)
    ensure_bucket(settings.S3_BUCKET_HLS)
    logging.info("Media API started")
