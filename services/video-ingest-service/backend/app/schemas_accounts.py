from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.models import ApplicationStatus, CompanyRole, JobStatus, JobVisibility


class UserOut(BaseModel):
    id: str
    email: Optional[str] = None
    full_name: Optional[str] = None

    class Config:
        orm_mode = True


class CompanyCreate(BaseModel):
    name: str = Field(..., description="Company name")
    website: Optional[str] = Field(None, description="Company website")


class CompanyOut(BaseModel):
    id: str
    name: str
    website: Optional[str] = None

    class Config:
        orm_mode = True


class LocationOut(BaseModel):
    id: str
    name: str
    city: Optional[str] = None
    region: Optional[str] = None
    country: Optional[str] = None
    postal_code: Optional[str] = None
    latitude: Optional[str] = None
    longitude: Optional[str] = None

    class Config:
        orm_mode = True


class CandidateProfileCreate(BaseModel):
    headline: Optional[str] = None
    location: Optional[str] = None
    location_id: Optional[str] = None
    summary: Optional[str] = None
    discoverable: bool = False


class CandidateProfileOut(BaseModel):
    id: str
    user_id: str
    headline: Optional[str] = None
    location: Optional[str] = None
    location_id: Optional[str] = None
    location_details: Optional[LocationOut] = None
    summary: Optional[str] = None
    discoverable: bool

    class Config:
        orm_mode = True


class JobCreate(BaseModel):
    company_id: str
    title: str
    description: Optional[str] = None
    keywords: Optional[list[str]] = None
    location: Optional[str] = None
    location_id: Optional[str] = None
    status: JobStatus = JobStatus.open
    visibility: JobVisibility = JobVisibility.public
    video_object_key: Optional[str] = None


class JobOut(BaseModel):
    id: str
    user_id: str
    company_id: str
    title: str
    description: Optional[str] = None
    keywords: Optional[list[str]] = None
    location: Optional[str] = None
    location_id: Optional[str] = None
    location_details: Optional[LocationOut] = None
    status: JobStatus
    visibility: JobVisibility
    video_object_key: Optional[str] = None
    playback_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True


class JobWithCountsOut(JobOut):
    applications_count: int = 0
    withheld_count: int = 0


class ApplicationCreate(BaseModel):
    video_object_key: str


class ApplicationUpdate(BaseModel):
    status: ApplicationStatus


class ApplicationOut(BaseModel):
    id: str
    job_id: str
    candidate_id: str
    status: ApplicationStatus
    video_object_key: Optional[str] = None
    applied_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True


class ApplicationDetailOut(BaseModel):
    id: str
    job_id: str
    candidate_id: str
    status: ApplicationStatus
    video_object_key: Optional[str] = None
    playback_url: Optional[str] = None
    applied_at: datetime
    updated_at: datetime
    candidate_profile: CandidateProfileOut


class ApplicationWithJobOut(BaseModel):
    id: str
    job_id: str
    candidate_id: str
    status: ApplicationStatus
    video_object_key: Optional[str] = None
    playback_url: Optional[str] = None
    applied_at: datetime
    updated_at: datetime
    job: JobOut


class MembershipOut(BaseModel):
    id: str
    user_id: str
    company_id: str
    role: CompanyRole
    is_default: bool

    class Config:
        orm_mode = True
