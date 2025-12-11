from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class VideoSource(str, Enum):
    recording = "recording"
    upload = "upload"


class UploadUrlRequest(BaseModel):
    file_name: Optional[str] = Field(None, description="Original file name to help build object key.")
    content_type: Optional[str] = Field(None, description="MIME type for the upload.")


class UploadUrlResponse(BaseModel):
    upload_url: str
    object_key: str
    expires_in: int


class ConfirmUploadRequest(BaseModel):
    object_key: str = Field(..., description="S3 object key that was uploaded.")
    duration_seconds: Optional[float] = Field(None, description="Duration of the uploaded video.")
    source: VideoSource = Field(..., description="Whether this came from a live recording or user upload.")


class ConfirmUploadResponse(BaseModel):
    status: str
    object_key: str
