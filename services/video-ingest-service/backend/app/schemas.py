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


class AudioChunkUrlRequest(BaseModel):
    session_id: str = Field(..., description="Client-generated session identifier for grouping chunks.")
    chunk_index: int = Field(..., ge=0, description="Monotonic chunk index starting at 0.")
    content_type: Optional[str] = Field(None, description="MIME type for the audio chunk upload.")
    file_name: Optional[str] = Field(None, description="Original chunk file name for extension inference.")


class AudioChunkUrlResponse(BaseModel):
    upload_url: str
    object_key: str
    expires_in: int


class AudioChunkConfirmRequest(BaseModel):
    session_id: str = Field(..., description="Session identifier used for this chunk.")
    chunk_index: int = Field(..., ge=0, description="Chunk index corresponding to the uploaded object.")
    object_key: str = Field(..., description="S3 object key for the uploaded chunk.")


class AudioChunkConfirmResponse(BaseModel):
    status: str
    object_key: str


class AudioSessionFinalizeRequest(BaseModel):
    session_id: str = Field(..., description="Session identifier to finalize.")
    total_chunks: int = Field(..., ge=0, description="Total number of chunks expected for the session.")


class AudioSessionFinalizeResponse(BaseModel):
    status: str


class AudioSessionTranscriptResponse(BaseModel):
    status: str
    transcript: str
    chunk_count: int
