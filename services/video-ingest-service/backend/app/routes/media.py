from fastapi import APIRouter, HTTPException

from app import storage
from app.celery_app import celery_app
from app.config import settings
from app.schemas import (
    ConfirmUploadRequest,
    ConfirmUploadResponse,
    UploadUrlRequest,
    UploadUrlResponse,
)

router = APIRouter(prefix="/videos", tags=["videos"])


@router.post("/upload-url", response_model=UploadUrlResponse)
async def create_upload_url(payload: UploadUrlRequest) -> UploadUrlResponse:
    try:
        object_key = storage.build_object_key(payload.file_name)
        presigned = storage.presign_put_object(
            bucket=settings.S3_BUCKET_RAW,
            object_key=object_key,
            content_type=payload.content_type,
            expires_in=settings.MEDIA_PRESIGN_EXPIRY_SEC,
        )
        return UploadUrlResponse(
            upload_url=presigned["upload_url"],
            object_key=presigned["object_key"],
            expires_in=settings.MEDIA_PRESIGN_EXPIRY_SEC,
        )
    except Exception as exc:  # pragma: no cover - defensive wrapper
        raise HTTPException(status_code=500, detail="Could not create upload URL") from exc


@router.post("/confirm-upload", response_model=ConfirmUploadResponse)
async def confirm_upload(payload: ConfirmUploadRequest) -> ConfirmUploadResponse:
    # Enqueue processing; the task is a placeholder until the pipeline is implemented.
    celery_app.send_task(
        "media.process_upload",
        args=[payload.object_key, settings.S3_BUCKET_RAW],
        kwargs={"duration_seconds": payload.duration_seconds, "source": payload.source.value},
    )
    return ConfirmUploadResponse(status="queued", object_key=payload.object_key)
