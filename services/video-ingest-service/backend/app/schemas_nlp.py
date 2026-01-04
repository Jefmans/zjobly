from typing import List, Optional

from pydantic import BaseModel, Field


class JobDraftRequest(BaseModel):
    transcript: str = Field(..., min_length=30, description="Job video transcript or raw text for the role.")
    language: Optional[str] = Field(
        None, description="Optional language/locale hint for the output (e.g., 'en', 'nl-BE')."
    )


class JobDraftResponse(BaseModel):
    title: str
    description: str
    keywords: List[str] = []
    transcript: Optional[str] = None


class JobDraftFromVideoRequest(BaseModel):
    object_key: str = Field(..., description="S3 object key for the uploaded video.")
    language: Optional[str] = Field(
        None, description="Optional language/locale hint for the output (e.g., 'en', 'nl-BE')."
    )


class LocationFromTranscriptRequest(BaseModel):
    transcript: str = Field(..., min_length=1, description="Transcript text to infer a location from.")


class LocationFromTranscriptResponse(BaseModel):
    location: Optional[str] = Field(None, description="Best-effort extracted location, or null if not found.")
    city: Optional[str] = Field(None, description="City extracted from the location text, if available.")
    region: Optional[str] = Field(None, description="Region/state extracted from the location text, if available.")
    country: Optional[str] = Field(None, description="Country extracted from the location text, if available.")
    postal_code: Optional[str] = Field(None, description="Postal/ZIP code extracted from the location text, if available.")


class ProfileDraftRequest(BaseModel):
    transcript: str = Field(..., min_length=20, description="Candidate intro transcript or raw text.")
    language: Optional[str] = Field(None, description="Optional language/locale hint (e.g., 'en', 'nl-BE').")


class ProfileDraftResponse(BaseModel):
    headline: str
    summary: str
    keywords: List[str] = []
    location: Optional[str] = None
