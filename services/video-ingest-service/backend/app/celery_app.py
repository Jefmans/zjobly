import io
import logging
from typing import Optional

from celery import Celery
from openai import OpenAI

from app import storage
from app.config import settings

logger = logging.getLogger(__name__)

celery_app = Celery(
    "media",
    broker=settings.REDIS_URL,
)

# Default queue for media processing
celery_app.conf.task_default_queue = "media"

_openai_client: Optional[OpenAI] = None


def get_openai_client() -> OpenAI:
    """
    Lazily construct an OpenAI client so the worker can reuse connections.
    """
    global _openai_client
    if _openai_client is None:
        api_key = settings.OPENAI_API_KEY
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY is required to transcribe uploads")
        _openai_client = OpenAI(api_key=api_key)
    return _openai_client


def fetch_object(bucket: str, object_key: str) -> io.BytesIO:
    """
    Download an object from MinIO and return a file-like buffer with a name attribute.
    """
    s3 = storage.get_s3_client()
    resp = s3.get_object(Bucket=bucket, Key=object_key)
    data = resp["Body"].read()
    buf = io.BytesIO(data)
    buf.name = object_key.split("/")[-1] or "upload.bin"
    return buf


def call_whisper(file_obj: io.BytesIO) -> str:
    client = get_openai_client()
    file_obj.seek(0)
    # Normalize legacy model names to the hosted API variant.
    model = settings.WHISPER_MODEL or "whisper-1"
    if model.lower() == "small":
        model = "whisper-1"
    response = client.audio.transcriptions.create(model=model, file=file_obj)
    return response.text


@celery_app.task(name="media.process_upload", bind=True, max_retries=3, default_retry_delay=30)
def process_upload(
    self,
    object_key: str,
    bucket: str,
    duration_seconds: float | None = None,
    source: str | None = None,
):
    """
    Pull the uploaded media from MinIO, send to Whisper for transcription, and enqueue NLP processing.
    """
    try:
        media_file = fetch_object(bucket, object_key)
        transcript = call_whisper(media_file)

        # Enqueue downstream NLP job with the transcript.
        celery_app.send_task(
            "nlp.process_document",
            args=[object_key, transcript],
            kwargs={"job_id": None},
            queue="celery",  # NLP worker listens on the default queue
        )

        logger.info(
            "Processed upload %s from bucket=%s (duration=%s, source=%s, transcript_chars=%s)",
            object_key,
            bucket,
            duration_seconds,
            source,
            len(transcript),
        )
        return {
            "status": "ok",
            "object_key": object_key,
            "bucket": bucket,
            "duration_seconds": duration_seconds,
            "source": source,
            "transcript_length": len(transcript),
        }
    except Exception as exc:  # noqa: BLE001
        logger.exception("Failed to process upload %s from bucket %s", object_key, bucket)
        raise self.retry(exc=exc)
