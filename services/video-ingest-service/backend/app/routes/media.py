import os

from fastapi import APIRouter, HTTPException

from app import storage
from app.celery_app import celery_app
from app.config import settings
from app.schemas import (
    AudioChunkConfirmRequest,
    AudioChunkConfirmResponse,
    AudioChunkUrlRequest,
    AudioChunkUrlResponse,
    AudioSessionFinalizeRequest,
    AudioSessionFinalizeResponse,
    AudioSessionTranscriptResponse,
    ConfirmUploadRequest,
    ConfirmUploadResponse,
    UploadUrlRequest,
    UploadUrlResponse,
)

router = APIRouter(prefix="", tags=["videos"])


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


def _pick_chunk_filename(chunk_index: int, file_name: str | None, content_type: str | None) -> str:
    """
    Always include the chunk index in the filename so each upload key is unique.
    The caller still sends a filename to S3 for ContentType inference, but the object key will
    be derived from the chunk index server-side.
    """
    ext: str | None = None
    if file_name:
        base = os.path.basename(file_name)
        _, ext_with_dot = os.path.splitext(base)
        ext = ext_with_dot.lstrip(".") or None

    if not ext:
        if content_type and "ogg" in content_type:
            ext = "ogg"
        elif content_type and "wav" in content_type:
            ext = "wav"
        elif content_type and "mp4" in content_type or (content_type and "aac" in content_type):
            ext = "m4a"
        else:
            ext = "webm"

    return f"chunk-{chunk_index:06d}.{ext}"


@router.post("/audio-chunk-url", response_model=AudioChunkUrlResponse)
async def create_audio_chunk_url(payload: AudioChunkUrlRequest) -> AudioChunkUrlResponse:
    try:
        chunk_name = _pick_chunk_filename(payload.chunk_index, payload.file_name, payload.content_type)
        object_key = storage.build_audio_chunk_object_key(payload.session_id, payload.chunk_index, chunk_name)
        presigned = storage.presign_put_object(
            bucket=settings.S3_BUCKET_RAW,
            object_key=object_key,
            content_type=payload.content_type,
            expires_in=settings.MEDIA_PRESIGN_EXPIRY_SEC,
        )
        return AudioChunkUrlResponse(
            upload_url=presigned["upload_url"],
            object_key=presigned["object_key"],
            expires_in=settings.MEDIA_PRESIGN_EXPIRY_SEC,
        )
    except Exception as exc:  # pragma: no cover - defensive wrapper
        raise HTTPException(status_code=500, detail="Could not create audio chunk upload URL") from exc


@router.post("/audio-chunk-confirm", response_model=AudioChunkConfirmResponse)
async def confirm_audio_chunk(payload: AudioChunkConfirmRequest) -> AudioChunkConfirmResponse:
    try:
        # Validate the chunk exists and is non-empty before queuing transcription.
        s3 = storage.get_s3_client()
        try:
            head = s3.head_object(Bucket=settings.S3_BUCKET_RAW, Key=payload.object_key)
            size = head.get("ContentLength") or 0
            if size <= 0:
                raise HTTPException(status_code=400, detail="Uploaded audio chunk is empty.")
        except HTTPException:
            raise
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=400, detail="Uploaded audio chunk not found.") from exc

        celery_app.send_task(
            "media.process_audio_chunk",
            args=[payload.session_id, payload.chunk_index, payload.object_key],
            kwargs={"bucket": settings.S3_BUCKET_RAW},
        )
        return AudioChunkConfirmResponse(status="queued", object_key=payload.object_key)
    except Exception as exc:  # pragma: no cover - defensive wrapper
        raise HTTPException(status_code=500, detail="Could not queue audio chunk") from exc


@router.post("/audio-session/finalize", response_model=AudioSessionFinalizeResponse)
async def finalize_audio_session(payload: AudioSessionFinalizeRequest) -> AudioSessionFinalizeResponse:
    try:
        celery_app.send_task(
            "media.finalize_audio_session",
            args=[payload.session_id, payload.total_chunks],
            kwargs={"bucket": settings.S3_BUCKET_RAW},
        )
        return AudioSessionFinalizeResponse(status="queued")
    except Exception as exc:  # pragma: no cover - defensive wrapper
        raise HTTPException(status_code=500, detail="Could not finalize audio session") from exc


@router.get("/audio-session/{session_id}/transcript", response_model=AudioSessionTranscriptResponse)
async def get_audio_session_transcript(session_id: str) -> AudioSessionTranscriptResponse:
    safe_session = storage.sanitize_token(session_id)
    if not safe_session:
        raise HTTPException(status_code=400, detail="Invalid session id")

    bucket = settings.S3_BUCKET_RAW
    final_key = storage.build_audio_final_transcript_key(session_id)
    try:
        final_transcript = storage.get_text_object(bucket, final_key)
        return AudioSessionTranscriptResponse(status="final", transcript=final_transcript, chunk_count=0)
    except FileNotFoundError:
        pass

    prefix = f"audio-sessions/{safe_session}/transcripts/"
    keys = storage.list_objects(bucket, prefix)
    chunk_keys = sorted([k for k in keys if "/chunk-" in k and k.endswith(".txt")])
    transcripts: list[str] = []
    for key in chunk_keys:
        try:
            transcripts.append(storage.get_text_object(bucket, key).strip())
        except FileNotFoundError:
            continue

    if transcripts:
        return AudioSessionTranscriptResponse(
            status="partial",
            transcript="\n".join(t for t in transcripts if t),
            chunk_count=len(transcripts),
        )

    return AudioSessionTranscriptResponse(status="pending", transcript="", chunk_count=0)
