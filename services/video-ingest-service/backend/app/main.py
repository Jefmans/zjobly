import logging
from fastapi import FastAPI

from app.config import settings
from app.routes import media


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
    return app


app = create_app()


@app.on_event("startup")
async def startup_event() -> None:
    logging.info("Media API started")
