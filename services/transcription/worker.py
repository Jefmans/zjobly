import io
import logging
import os
from typing import Dict, Optional

import boto3
from botocore.client import Config
from celery import Celery
from openai import OpenAI

logger = logging.getLogger(__name__)
DEFAULT_MEDIA_BUCKET = os.getenv("MINIO_BUCKET", "media")

celery_app = Celery(
    "transcription",
    broker=os.getenv("REDIS_URL", "redis://redis:6379/0"),
)

# OpenAI + MinIO clients are created lazily to keep workers reusable.
_openai_client: Optional[OpenAI] = None
_s3_client = None


def get_openai_client() -> OpenAI:
    global _openai_client
    if _openai_client is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY is required for transcription")
        _openai_client = OpenAI(api_key=api_key)
    return _openai_client


def get_s3_client():
    global _s3_client
    if _s3_client is None:
        endpoint = os.getenv("MINIO_ENDPOINT", "http://minio:9000")
        access_key = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
        secret_key = os.getenv("MINIO_SECRET_KEY", "minioadmin")
        _s3_client = boto3.client(
            "s3",
            endpoint_url=endpoint,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            config=Config(signature_version="s3v4"),
        )
    return _s3_client


def fetch_media(bucket: str, key: str) -> io.BytesIO:
    s3 = get_s3_client()
    resp = s3.get_object(Bucket=bucket, Key=key)
    body = resp["Body"].read()
    buf = io.BytesIO(body)
    # OpenAI client expects a file-like with a name attribute
    buf.name = key.split("/")[-1] or "audio.mp4"
    return buf


def call_whisper(file_obj: io.BytesIO, language: Optional[str] = None) -> str:
    client = get_openai_client()
    file_obj.seek(0)
    kwargs: Dict[str, str] = {"model": "whisper-1"}
    if language:
        kwargs["language"] = language
    response = client.audio.transcriptions.create(file=file_obj, **kwargs)
    return response.text


@celery_app.task(name="transcription.transcribe", bind=True, max_retries=3, default_retry_delay=15)
def transcribe(self, object_key: str, bucket: Optional[str] = None, language: Optional[str] = None) -> dict:
    """
    Downloads media from MinIO and calls OpenAI Whisper API.
    TODO:
      - Persist transcript to Postgres and/or MinIO.
      - Publish NLP job with identifiers needed downstream.
    """
    try:
        bucket_to_use = bucket or DEFAULT_MEDIA_BUCKET
        media_file = fetch_media(bucket_to_use, object_key)
        transcript = call_whisper(media_file, language=language)
        logger.info("Transcribed %s bytes from %s/%s", media_file.getbuffer().nbytes, bucket_to_use, object_key)
        return {
            "status": "ok",
            "object_key": object_key,
            "bucket": bucket_to_use,
            "transcript": transcript,
        }
    except Exception as exc:  # noqa: BLE001
        logger.exception("Transcription failed for %s/%s", bucket, object_key)
        raise self.retry(exc=exc)
