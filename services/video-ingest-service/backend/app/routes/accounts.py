from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_session
from app import models
from app import storage
from app.config import settings
from app.schemas_accounts import (
    CandidateProfileCreate,
    CandidateProfileOut,
    CompanyCreate,
    CompanyOut,
    JobCreate,
    JobOut,
)

router = APIRouter(prefix="/accounts", tags=["accounts"])


def get_current_user(
    session: Session = Depends(get_session),
    user_id: Optional[str] = Header(None, alias="X-User-Id"),
    user_email: Optional[str] = Header(None, alias="X-User-Email"),
) -> models.User:
    """
    Simple header-based auth stub. In production, replace with JWT/OIDC.
    """
    if not user_id:
        raise HTTPException(status_code=401, detail="Missing X-User-Id header")

    user = session.get(models.User, user_id)
    if not user:
        user = models.User(id=user_id, email=user_email)
        session.add(user)
        session.commit()
        session.refresh(user)
    return user


@router.post("/companies", response_model=CompanyOut)
def create_company(
    payload: CompanyCreate,
    session: Session = Depends(get_session),
    current_user: models.User = Depends(get_current_user),
) -> CompanyOut:
    existing = session.query(models.Company).filter(models.Company.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Company with that name already exists")

    company = models.Company(name=payload.name, website=payload.website)
    session.add(company)
    session.flush()

    membership = models.CompanyMembership(
        user_id=current_user.id,
        company_id=company.id,
        role=models.CompanyRole.admin,
        is_default=True,
    )
    session.add(membership)
    session.commit()
    session.refresh(company)
    return company


@router.post("/candidate-profile", response_model=CandidateProfileOut)
def upsert_candidate_profile(
    payload: CandidateProfileCreate,
    session: Session = Depends(get_session),
    current_user: models.User = Depends(get_current_user),
) -> CandidateProfileOut:
    profile = session.query(models.CandidateProfile).filter_by(user_id=current_user.id).first()
    if not profile:
        profile = models.CandidateProfile(
            user_id=current_user.id,
            headline=payload.headline,
            location=payload.location,
            summary=payload.summary,
            discoverable=payload.discoverable,
        )
        session.add(profile)
    else:
        profile.headline = payload.headline
        profile.location = payload.location
        profile.summary = payload.summary
        profile.discoverable = payload.discoverable

    session.commit()
    session.refresh(profile)
    return profile


def _assert_membership(session: Session, company_id: str, user_id: str) -> models.CompanyMembership:
    membership = (
        session.query(models.CompanyMembership)
        .filter(
            models.CompanyMembership.company_id == company_id,
            models.CompanyMembership.user_id == user_id,
        )
        .first()
    )
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this company")
    return membership


def _build_job_out(job: models.Job) -> JobOut:
    playback_url = None
    if job.video_object_key:
        try:
            presigned = storage.presign_get_object(
                bucket=settings.S3_BUCKET_RAW,
                object_key=job.video_object_key,
                expires_in=settings.MEDIA_PLAY_SIGN_EXPIRY_SEC,
            )
            playback_url = presigned["play_url"]
        except Exception:
            playback_url = None

    return JobOut(
        id=job.id,
        user_id=job.user_id,
        company_id=job.company_id,
        title=job.title,
        description=job.description,
        location=job.location,
        status=job.status,
        visibility=job.visibility,
        video_object_key=job.video_object_key,
        playback_url=playback_url,
        created_at=job.created_at,
        updated_at=job.updated_at,
    )


@router.post("/jobs", response_model=JobOut)
def create_job(
    payload: JobCreate,
    session: Session = Depends(get_session),
    current_user: models.User = Depends(get_current_user),
) -> JobOut:
    _assert_membership(session, payload.company_id, current_user.id)

    job = models.Job(
        user_id=current_user.id,
        company_id=payload.company_id,
        title=payload.title,
        description=payload.description,
        location=payload.location,
        status=payload.status,
        visibility=payload.visibility,
        video_object_key=payload.video_object_key,
    )
    session.add(job)
    session.commit()
    session.refresh(job)
    return _build_job_out(job)


@router.get("/jobs", response_model=list[JobOut])
def list_company_jobs(
    company_id: str,
    session: Session = Depends(get_session),
    current_user: models.User = Depends(get_current_user),
) -> list[JobOut]:
    _assert_membership(session, company_id, current_user.id)
    jobs = (
        session.query(models.Job)
        .filter(models.Job.company_id == company_id)
        .order_by(models.Job.created_at.desc())
        .all()
    )
    return [_build_job_out(job) for job in jobs]


@router.get("/jobs/search", response_model=list[JobOut])
def search_jobs(
    q: Optional[str] = Query(None, description="Search term across title"),
    session: Session = Depends(get_session),
) -> list[JobOut]:
    query = session.query(models.Job).filter(
        models.Job.status == models.JobStatus.open,
        models.Job.visibility == models.JobVisibility.public,
    )
    if q:
        ilike = f"%{q}%"
        query = query.filter(models.Job.title.ilike(ilike))
    results = query.order_by(models.Job.created_at.desc()).limit(50).all()
    return [_build_job_out(job) for job in results]


@router.get("/candidates/search", response_model=list[CandidateProfileOut])
def search_candidates(
    q: Optional[str] = Query(None, description="Search term across headline"),
    session: Session = Depends(get_session),
    current_user: models.User = Depends(get_current_user),
) -> list[CandidateProfileOut]:
    # Company membership required to search candidates.
    membership = session.query(models.CompanyMembership).filter_by(user_id=current_user.id).first()
    if not membership:
        raise HTTPException(status_code=403, detail="Join a company to search candidates")

    query = session.query(models.CandidateProfile).filter(models.CandidateProfile.discoverable.is_(True))
    if q:
        ilike = f"%{q}%"
        query = query.filter(models.CandidateProfile.headline.ilike(ilike))
    return query.order_by(models.CandidateProfile.updated_at.desc()).limit(50).all()
