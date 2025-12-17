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
        config=Config(signature_version="s3v4"),
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
