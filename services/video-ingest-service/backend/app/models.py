import uuid
from datetime import datetime
from enum import Enum
from typing import Optional

from sqlalchemy import Boolean, DateTime, Enum as SAEnum, ForeignKey, JSON, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def _uuid() -> str:
    return uuid.uuid4().hex


class Base(DeclarativeBase):
    pass


class CompanyRole(str, Enum):
    admin = "admin"
    recruiter = "recruiter"
    viewer = "viewer"


class JobStatus(str, Enum):
    draft = "draft"
    open = "open"
    closed = "closed"


class JobVisibility(str, Enum):
    public = "public"
    private = "private"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    email: Mapped[str | None] = mapped_column(String(255), unique=True, index=True, nullable=True)
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    candidate_profile: Mapped["CandidateProfile"] = relationship(back_populates="user", uselist=False)
    memberships: Mapped[list["CompanyMembership"]] = relationship(back_populates="user")


class Company(Base):
    __tablename__ = "companies"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    website: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    members: Mapped[list["CompanyMembership"]] = relationship(back_populates="company")
    jobs: Mapped[list["Job"]] = relationship(back_populates="company")


class CompanyMembership(Base):
    __tablename__ = "company_memberships"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id"), index=True)
    role: Mapped[CompanyRole] = mapped_column(SAEnum(CompanyRole), default=CompanyRole.recruiter)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped[User] = relationship(back_populates="memberships")
    company: Mapped[Company] = relationship(back_populates="members")


class CandidateProfile(Base):
    __tablename__ = "candidate_profiles"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), unique=True, index=True)
    headline: Mapped[str | None] = mapped_column(String(255), nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    location_id: Mapped[str | None] = mapped_column(ForeignKey("locations.id"), nullable=True, index=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    discoverable: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user: Mapped[User] = relationship(back_populates="candidate_profile")
    applications: Mapped[list["Application"]] = relationship(back_populates="candidate")
    location_ref: Mapped[Optional["Location"]] = relationship(back_populates="candidates")


class Location(Base):
    __tablename__ = "locations"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    city: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    region: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    country: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    postal_code: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    latitude: Mapped[str | None] = mapped_column(String(64), nullable=True)
    longitude: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    jobs: Mapped[list["Job"]] = relationship(back_populates="location_ref")
    candidates: Mapped[list["CandidateProfile"]] = relationship(back_populates="location_ref")


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id"), index=True)
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    keywords: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    location_id: Mapped[str | None] = mapped_column(ForeignKey("locations.id"), nullable=True, index=True)
    status: Mapped[JobStatus] = mapped_column(SAEnum(JobStatus), default=JobStatus.open)
    visibility: Mapped[JobVisibility] = mapped_column(SAEnum(JobVisibility), default=JobVisibility.public)
    video_object_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user: Mapped["User"] = relationship()
    company: Mapped[Company] = relationship(back_populates="jobs")
    location_ref: Mapped[Location | None] = relationship(back_populates="jobs")
    applications: Mapped[list["Application"]] = relationship(back_populates="job")


class ApplicationStatus(str, Enum):
    applied = "applied"
    reviewing = "reviewing"
    rejected = "rejected"
    hired = "hired"


class Application(Base):
    __tablename__ = "applications"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    job_id: Mapped[str] = mapped_column(ForeignKey("jobs.id"), index=True)
    candidate_id: Mapped[str] = mapped_column(ForeignKey("candidate_profiles.id"), index=True)
    status: Mapped[ApplicationStatus] = mapped_column(SAEnum(ApplicationStatus), default=ApplicationStatus.applied)
    video_object_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    applied_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    job: Mapped[Job] = relationship(back_populates="applications")
    candidate: Mapped[CandidateProfile] = relationship(back_populates="applications")
