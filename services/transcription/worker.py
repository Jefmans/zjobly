import os
from celery import Celery

# Simple Celery app that will consume transcription jobs from Redis.
celery_app = Celery(
    "transcription",
    broker=os.getenv("REDIS_URL", "redis://redis:6379/0"),
)


@celery_app.task(name="transcription.transcribe")
def transcribe(object_key: str, bucket: str = "media") -> dict:
    """
    Placeholder transcription task.
    TODO:
      - Fetch the media object from MinIO using boto3 and MINIO_* env vars.
      - POST bytes or a presigned URL to OpenAI Whisper API (model=whisper-1).
      - Store transcript in Postgres and/or MinIO.
      - Publish an NLP job with identifiers needed downstream.
    """
    return {
        "status": "not_implemented",
        "object_key": object_key,
        "bucket": bucket,
    }
