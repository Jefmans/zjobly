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
