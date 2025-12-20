import logging
import time
from functools import lru_cache
from typing import Optional
from uuid import uuid4

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

from app.config import settings

logger = logging.getLogger(__name__)
SANITIZE_ALLOWED = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_")

DEFAULT_CORS_ALLOWED_METHODS = ["GET", "PUT", "POST", "HEAD", "DELETE"]
DEFAULT_CORS_ALLOWED_HEADERS = ["*"]
DEFAULT_CORS_EXPOSE_HEADERS = ["ETag", "x-amz-request-id", "x-amz-id-2"]
DEFAULT_CORS_MAX_AGE = 3000
DEFAULT_CORS_ALLOWED_ORIGINS = [
    "https://zjobly.com",
    "https://www.zjobly.com",
    "http://localhost:5173",
    "http://localhost",
]


@lru_cache(maxsize=1)
def get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=settings.S3_ENDPOINT,
        aws_access_key_id=settings.S3_ACCESS_KEY,
        aws_secret_access_key=settings.S3_SECRET_KEY,
        config=Config(
            signature_version="s3v4",
            s3={"addressing_style": "path"},
        ),
    )



def build_object_key(file_name: Optional[str]) -> str:
    suffix = file_name or "upload.bin"
    return f"uploads/{uuid4().hex}/{suffix}"


def presign_put_object(
    bucket: str,
    object_key: str,
    content_type: Optional[str],
    expires_in: int,
) -> dict:
    client = get_s3_client()
    params = {
        "Bucket": bucket,
        "Key": object_key,
    }
    if content_type:
        params["ContentType"] = content_type

    url = client.generate_presigned_url(
        "put_object",
        Params=params,
        ExpiresIn=expires_in,
    )
    return {
        "upload_url": url,
        "object_key": object_key,
        "expires_at": int(time.time()) + expires_in,
    }


def presign_get_object(bucket: str, object_key: str, expires_in: int) -> dict:
    client = get_s3_client()
    url = client.generate_presigned_url(
        "get_object",
        Params={"Bucket": bucket, "Key": object_key},
        ExpiresIn=expires_in,
    )
    return {
        "play_url": url,
        "object_key": object_key,
        "expires_at": int(time.time()) + expires_in,
    }


def ensure_bucket(bucket: str) -> None:
    """
    Ensure the bucket exists in MinIO. No-op if already present.
    """
    client = get_s3_client()
    try:
        client.head_bucket(Bucket=bucket)
    except ClientError as exc:
        error_code = int(exc.response.get("Error", {}).get("Code", 0))
        if error_code in (404, 400, 301):
            client.create_bucket(Bucket=bucket)
        else:
            raise


def ensure_bucket_cors(bucket: str, origins: Optional[list[str]] = None) -> None:
    client = get_s3_client()
    allowed_origins = [origin for origin in (origins or DEFAULT_CORS_ALLOWED_ORIGINS) if origin]
    if not allowed_origins:
        logger.warning("Skipping CORS setup for %s: no allowed origins configured.", bucket)
        return
    client.put_bucket_cors(
        Bucket=bucket,
        CORSConfiguration={
            "CORSRules": [
                {
                    "AllowedOrigins": allowed_origins,
                    "AllowedMethods": DEFAULT_CORS_ALLOWED_METHODS,
                    "AllowedHeaders": DEFAULT_CORS_ALLOWED_HEADERS,
                    "ExposeHeaders": DEFAULT_CORS_EXPOSE_HEADERS,
                    "MaxAgeSeconds": DEFAULT_CORS_MAX_AGE,
                }
            ]
        },
    )


def sanitize_token(value: str) -> str:
    """
    Keep a small set of characters to avoid unsafe S3 object keys derived from user input.
    """
    return "".join(ch for ch in value if ch in SANITIZE_ALLOWED)


def put_text_object(bucket: str, object_key: str, text: str) -> None:
    client = get_s3_client()
    client.put_object(
        Bucket=bucket,
        Key=object_key,
        Body=(text or "").encode("utf-8"),
        ContentType="text/plain; charset=utf-8",
    )


def get_text_object(bucket: str, object_key: str) -> str:
    client = get_s3_client()
    try:
        response = client.get_object(Bucket=bucket, Key=object_key)
    except ClientError as exc:  # noqa: BLE001
        code = exc.response.get("Error", {}).get("Code")
        if code in ("NoSuchKey", "404", "NotFound"):
            raise FileNotFoundError(object_key) from exc
        raise
    body = response.get("Body")
    if not body:
        raise FileNotFoundError(object_key)
    return body.read().decode("utf-8")


def list_objects(bucket: str, prefix: str) -> list[str]:
    """
    List object keys under a prefix. Returns an empty list when no keys exist.
    """
    client = get_s3_client()
    keys: list[str] = []
    continuation_token = None
    while True:
        kwargs = {"Bucket": bucket, "Prefix": prefix}
        if continuation_token:
            kwargs["ContinuationToken"] = continuation_token
        response = client.list_objects_v2(**kwargs)
        contents = response.get("Contents") or []
        keys.extend([item["Key"] for item in contents if "Key" in item])
        if not response.get("IsTruncated"):
            break
        continuation_token = response.get("NextContinuationToken")
    return keys


def build_audio_chunk_object_key(session_id: str, chunk_index: int, file_name: Optional[str] = None) -> str:
    safe_session = sanitize_token(session_id) or "session"
    ext = None
    if file_name:
        base = file_name.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
        if "." in base:
            ext = base.rsplit(".", 1)[-1] or None
    suffix = f"chunk-{chunk_index:06d}.{ext or 'webm'}"
    return f"audio-sessions/{safe_session}/chunks/{suffix}"


def build_audio_transcript_object_key(session_id: str, chunk_index: int) -> str:
    safe_session = sanitize_token(session_id) or "session"
    return f"audio-sessions/{safe_session}/transcripts/chunk-{chunk_index:06d}.txt"


def build_audio_final_transcript_key(session_id: str) -> str:
    safe_session = sanitize_token(session_id) or "session"
    return f"audio-sessions/{safe_session}/transcripts/final.txt"
