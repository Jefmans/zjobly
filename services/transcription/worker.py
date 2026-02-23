import io
import json
import logging
import os
from pathlib import Path

import boto3
from botocore.client import BaseClient, Config
from celery import Celery
import httpx
from openai import OpenAI

logger = logging.getLogger(__name__)
DEFAULT_MEDIA_BUCKET = os.getenv("MINIO_BUCKET", "media")
OPENAI_MAX_BYTES = 25 * 1024 * 1024
_runtime_config_cache: dict[str, object] | None = None

celery_app = Celery(
    "transcription",
    broker=os.getenv("REDIS_URL", "redis://redis:6379/0"),
)

# Listen on a dedicated queue so it doesn't consume NLP tasks.
celery_app.conf.task_default_queue = "transcription"

# OpenAI + MinIO clients are created lazily to keep workers reusable.
_openai_client: OpenAI | None = None
_s3_client: BaseClient | None = None


def _resolve_config_dir() -> Path:
    explicit = (os.getenv("ZJOBLY_CONFIG_DIR") or "").strip()
    if explicit:
        return Path(explicit)
    mounted = Path("/config")
    if mounted.exists():
        return mounted
    repo_root = Path(__file__).resolve().parents[2]
    root_config = repo_root / "config"
    if root_config.exists():
        return root_config
    return Path(__file__).resolve().parent / "config"


RUNTIME_CONFIG_PATH = _resolve_config_dir() / "runtime.json"


def _load_runtime_config() -> dict[str, object]:
    global _runtime_config_cache
    if _runtime_config_cache is not None:
        return _runtime_config_cache
    if not RUNTIME_CONFIG_PATH.exists():
        _runtime_config_cache = {}
        return _runtime_config_cache
    try:
        parsed = json.loads(RUNTIME_CONFIG_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        _runtime_config_cache = {}
        return _runtime_config_cache
    if not isinstance(parsed, dict):
        _runtime_config_cache = {}
        return _runtime_config_cache
    _runtime_config_cache = parsed
    return _runtime_config_cache


def _get_runtime_int(keys: tuple[str, ...], fallback: int) -> int:
    current: object = _load_runtime_config()
    for key in keys:
        if not isinstance(current, dict):
            return fallback
        current = current.get(key)
    try:
        parsed = int(current)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return fallback
    return parsed if parsed > 0 else fallback


OPENAI_MAX_BYTES = _get_runtime_int(("workers", "openAiMaxUploadBytes"), OPENAI_MAX_BYTES)


def get_openai_client() -> OpenAI:
    global _openai_client
    if _openai_client is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY is required for transcription")
        _openai_client = OpenAI(api_key=api_key, http_client=httpx.Client(timeout=60, trust_env=False))
    return _openai_client


def get_s3_client() -> BaseClient:
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
    size_bytes = resp.get("ContentLength") or 0
    if size_bytes <= 0:
        raise RuntimeError("Object is empty")
    if size_bytes > OPENAI_MAX_BYTES:
        raise RuntimeError("Object exceeds OpenAI upload limit")
    body = resp["Body"].read()
    buf = io.BytesIO(body)
    # OpenAI client expects a file-like with a name attribute
    buf.name = key.split("/")[-1] or "audio.mp4"
    return buf


def call_whisper(file_obj: io.BytesIO, language: str | None = None) -> str:
    client = get_openai_client()
    file_obj.seek(0)
    kwargs: dict[str, str] = {"model": "whisper-1"}
    if language:
        kwargs["language"] = language
    response = client.audio.transcriptions.create(file=file_obj, **kwargs)
    return response.text


@celery_app.task(name="transcription.transcribe", bind=True, max_retries=3, default_retry_delay=15)
def transcribe(self, object_key: str, bucket: str | None = None, language: str | None = None) -> dict[str, object]:
    """
    Downloads media from MinIO and calls OpenAI Whisper API.
    """
    bucket_to_use = bucket or DEFAULT_MEDIA_BUCKET
    try:
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
        logger.exception("Transcription failed for %s/%s", bucket_to_use, object_key)
        raise self.retry(exc=exc)
