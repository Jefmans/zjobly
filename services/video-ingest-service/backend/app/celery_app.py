from celery import Celery

from app.config import settings

celery_app = Celery(
    "media",
    broker=settings.REDIS_URL,
)

# Default queue for media processing
celery_app.conf.task_default_queue = "media"


@celery_app.task(name="media.process_upload")
def process_upload(object_key: str, bucket: str, duration_seconds: float | None = None, source: str | None = None):
    """
    Placeholder processing task.
    TODO: pull from MinIO, transcode if needed, send to Whisper for transcription,
    and publish NLP/embedding job.
    """
    return {
        "status": "not_implemented",
        "object_key": object_key,
        "bucket": bucket,
        "duration_seconds": duration_seconds,
        "source": source,
    }
