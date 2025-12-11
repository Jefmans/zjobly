import time
from functools import lru_cache
from typing import Optional
from uuid import uuid4

import boto3
from botocore.client import Config

from app.config import settings


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
