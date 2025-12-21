import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routes import accounts
from app.routes import media
from app.routes import nlp
from app.storage import ensure_bucket, ensure_bucket_cors


def create_app() -> FastAPI:
    app = FastAPI(
        title="Media API",
        version="0.1.0",
        root_path=settings.API_ROOT_PATH or None,
    )

    # Allow browser clients (zjobly.com) to call the API directly.
    allowed_origins = settings.MEDIA_CORS_ALLOWED_ORIGINS or ["*"]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["*"],
        allow_credentials=False,
    )

    @app.get("/health", tags=["system"])
    async def health() -> dict:
        return {"status": "ok"}

    app.include_router(media.router, prefix=settings.API_PREFIX)
    app.include_router(accounts.router, prefix=settings.API_PREFIX)
    app.include_router(nlp.router, prefix=settings.API_PREFIX)
    return app


app = create_app()


@app.on_event("startup")
async def startup_event() -> None:
    # Make sure required buckets exist in MinIO.
    ensure_bucket(settings.S3_BUCKET_RAW)
    ensure_bucket(settings.S3_BUCKET_HLS)
    try:
        ensure_bucket_cors(settings.S3_BUCKET_RAW, settings.MEDIA_CORS_ALLOWED_ORIGINS)
        ensure_bucket_cors(settings.S3_BUCKET_HLS, settings.MEDIA_CORS_ALLOWED_ORIGINS)
    except Exception:
        logging.exception("Failed to apply CORS configuration to MinIO buckets.")
    logging.info("Media API started")
