from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import case, func
from sqlalchemy.orm import Session, joinedload

from app.database import get_session
from app import models
from app import storage
from app.config import settings
from app.schemas_accounts import (
    ApplicationCreate,
    ApplicationDetailOut,
    ApplicationOut,
    ApplicationUpdate,
    ApplicationWithJobOut,
    CandidateProfileCreate,
    CandidateProfileOut,
    CompanyCreate,
    CompanyOut,
    JobCreate,
    JobOut,
    JobWithCountsOut,
)
from app.routes import nlp as nlp_routes

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


def _resolve_location_payload(
    session: Session, location_id: Optional[str], location_text: Optional[str]
) -> tuple[Optional[str], Optional[str], Optional[models.Location]]:
    """
    Resolve a location id or freeform text into a persisted Location row, returning
    the chosen id, the human-friendly string, and the Location model (if any).
    """
    resolved_id = location_id
    resolved_str = (location_text or "").strip() or None
    location_obj: models.Location | None = None

    if location_id:
        location_obj = session.get(models.Location, location_id)
        if not location_obj:
            raise HTTPException(status_code=404, detail="Location not found")
        if not resolved_str:
            resolved_str = location_obj.name
    elif resolved_str:
        geo = nlp_routes._geocode_location(resolved_str)
        location_name = (
            ", ".join([comp for comp in [geo.get("city"), geo.get("region"), geo.get("country")] if comp])
            or geo.get("postal_code")
            or resolved_str
        )
        location_obj = (
            session.query(models.Location)
            .filter(
                models.Location.name == location_name,
                models.Location.city == (geo.get("city") or None),
                models.Location.region == (geo.get("region") or None),
                models.Location.country == (geo.get("country") or None),
                models.Location.postal_code == (geo.get("postal_code") or None),
            )
            .first()
        )
        if not location_obj:
            location_obj = models.Location(
                name=location_name,
                city=geo.get("city") or None,
                region=geo.get("region") or None,
                country=geo.get("country") or None,
                postal_code=geo.get("postal_code") or None,
                latitude=geo.get("latitude") or None,
                longitude=geo.get("longitude") or None,
            )
            session.add(location_obj)
            session.flush()
        resolved_id = location_obj.id
        resolved_str = location_name

    return resolved_id, resolved_str, location_obj


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
    location_id, resolved_location_str, _ = _resolve_location_payload(
        session, payload.location_id, payload.location
    )
    profile = session.query(models.CandidateProfile).filter_by(user_id=current_user.id).first()
    if not profile:
        profile = models.CandidateProfile(
            user_id=current_user.id,
            headline=payload.headline,
            location=resolved_location_str,
            location_id=location_id,
            summary=payload.summary,
            keywords=payload.keywords,
            video_object_key=payload.video_object_key,
            discoverable=payload.discoverable,
        )
        session.add(profile)
    else:
        profile.headline = payload.headline
        profile.location = resolved_location_str
        profile.location_id = location_id
        profile.summary = payload.summary
        if payload.keywords is not None:
            profile.keywords = payload.keywords
        if payload.video_object_key is not None:
            profile.video_object_key = payload.video_object_key
        profile.discoverable = payload.discoverable

    session.commit()
    session.refresh(profile)
    return _build_candidate_out(profile)


@router.get("/candidate-profile", response_model=CandidateProfileOut)
def get_candidate_profile(
    session: Session = Depends(get_session),
    current_user: models.User = Depends(get_current_user),
) -> CandidateProfileOut:
    profile = (
        session.query(models.CandidateProfile)
        .options(joinedload(models.CandidateProfile.location_ref))
        .filter_by(user_id=current_user.id)
        .first()
    )
    if not profile:
        raise HTTPException(status_code=404, detail="Candidate profile not found")
    return _build_candidate_out(profile)


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
        keywords=job.keywords,
        location=job.location,
        location_id=job.location_id,
        location_details=job.location_ref,
        status=job.status,
        visibility=job.visibility,
        video_object_key=job.video_object_key,
        playback_url=playback_url,
        created_at=job.created_at,
        updated_at=job.updated_at,
    )


def _build_candidate_out(profile: models.CandidateProfile) -> CandidateProfileOut:
    playback_url = None
    if profile.video_object_key:
        try:
            presigned = storage.presign_get_object(
                bucket=settings.S3_BUCKET_RAW,
                object_key=profile.video_object_key,
                expires_in=settings.MEDIA_PLAY_SIGN_EXPIRY_SEC,
            )
            playback_url = presigned["play_url"]
        except Exception:
            playback_url = None

    return CandidateProfileOut(
        id=profile.id,
        user_id=profile.user_id,
        headline=profile.headline,
        location=profile.location,
        location_id=profile.location_id,
        location_details=profile.location_ref,
        summary=profile.summary,
        keywords=profile.keywords,
        video_object_key=profile.video_object_key,
        playback_url=playback_url,
        discoverable=profile.discoverable,
    )


def _build_application_detail_out(application: models.Application) -> ApplicationDetailOut:
    playback_url = None
    if application.video_object_key:
        try:
            presigned = storage.presign_get_object(
                bucket=settings.S3_BUCKET_RAW,
                object_key=application.video_object_key,
                expires_in=settings.MEDIA_PLAY_SIGN_EXPIRY_SEC,
            )
            playback_url = presigned["play_url"]
        except Exception:
            playback_url = None

    return ApplicationDetailOut(
        id=application.id,
        job_id=application.job_id,
        candidate_id=application.candidate_id,
        status=application.status,
        video_object_key=application.video_object_key,
        playback_url=playback_url,
        applied_at=application.applied_at,
        updated_at=application.updated_at,
        candidate_profile=_build_candidate_out(application.candidate),
    )


def _build_application_with_job_out(application: models.Application) -> ApplicationWithJobOut:
    playback_url = None
    if application.video_object_key:
        try:
            presigned = storage.presign_get_object(
                bucket=settings.S3_BUCKET_RAW,
                object_key=application.video_object_key,
                expires_in=settings.MEDIA_PLAY_SIGN_EXPIRY_SEC,
            )
            playback_url = presigned["play_url"]
        except Exception:
            playback_url = None

    return ApplicationWithJobOut(
        id=application.id,
        job_id=application.job_id,
        candidate_id=application.candidate_id,
        status=application.status,
        video_object_key=application.video_object_key,
        playback_url=playback_url,
        applied_at=application.applied_at,
        updated_at=application.updated_at,
        job=_build_job_out(application.job),
    )


@router.post("/jobs", response_model=JobOut)
def create_job(
    payload: JobCreate,
    session: Session = Depends(get_session),
    current_user: models.User = Depends(get_current_user),
) -> JobOut:
    _assert_membership(session, payload.company_id, current_user.id)

    location_id, resolved_location_str, _ = _resolve_location_payload(
        session, payload.location_id, payload.location
    )
    job = models.Job(
        user_id=current_user.id,
        company_id=payload.company_id,
        title=payload.title,
        description=payload.description,
        keywords=payload.keywords,
        location=resolved_location_str,
        location_id=location_id,
        status=payload.status,
        visibility=payload.visibility,
        video_object_key=payload.video_object_key,
    )
    session.add(job)
    session.commit()
    session.refresh(job)
    return _build_job_out(job)


@router.post("/jobs/{job_id}/applications", response_model=ApplicationOut)
def apply_to_job(
    job_id: str,
    payload: ApplicationCreate,
    session: Session = Depends(get_session),
    current_user: models.User = Depends(get_current_user),
) -> ApplicationOut:
    video_key = (payload.video_object_key or "").strip()
    if not video_key:
        raise HTTPException(status_code=400, detail="Missing application video")

    job = session.get(models.Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status != models.JobStatus.open or job.visibility != models.JobVisibility.public:
        raise HTTPException(status_code=400, detail="Job is not open for applications")

    profile = session.query(models.CandidateProfile).filter_by(user_id=current_user.id).first()
    if not profile:
        raise HTTPException(status_code=400, detail="Complete your candidate profile before applying")

    existing = (
        session.query(models.Application)
        .filter(
            models.Application.job_id == job_id,
            models.Application.candidate_id == profile.id,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="You already applied to this job")

    application = models.Application(
        job_id=job_id,
        candidate_id=profile.id,
        status=models.ApplicationStatus.applied,
        video_object_key=video_key,
    )
    session.add(application)
    session.commit()
    session.refresh(application)
    return application


@router.get("/applications", response_model=list[ApplicationWithJobOut])
def list_candidate_applications(
    session: Session = Depends(get_session),
    current_user: models.User = Depends(get_current_user),
) -> list[ApplicationWithJobOut]:
    profile = session.query(models.CandidateProfile).filter_by(user_id=current_user.id).first()
    if not profile:
        return []

    applications = (
        session.query(models.Application)
        .options(joinedload(models.Application.job).joinedload(models.Job.location_ref))
        .filter(models.Application.candidate_id == profile.id)
        .order_by(models.Application.applied_at.desc())
        .all()
    )
    return [_build_application_with_job_out(application) for application in applications]


@router.get("/jobs/{job_id}/applications", response_model=list[ApplicationDetailOut])
def list_job_applications(
    job_id: str,
    session: Session = Depends(get_session),
    current_user: models.User = Depends(get_current_user),
) -> list[ApplicationDetailOut]:
    job = session.get(models.Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    _assert_membership(session, job.company_id, current_user.id)

    applications = (
        session.query(models.Application)
        .options(joinedload(models.Application.candidate).joinedload(models.CandidateProfile.location_ref))
        .filter(models.Application.job_id == job_id)
        .order_by(models.Application.applied_at.desc())
        .all()
    )
    return [_build_application_detail_out(application) for application in applications]


@router.patch("/jobs/{job_id}/applications/{application_id}", response_model=ApplicationOut)
def update_job_application(
    job_id: str,
    application_id: str,
    payload: ApplicationUpdate,
    session: Session = Depends(get_session),
    current_user: models.User = Depends(get_current_user),
) -> ApplicationOut:
    job = session.get(models.Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    _assert_membership(session, job.company_id, current_user.id)

    application = session.get(models.Application, application_id)
    if not application or application.job_id != job_id:
        raise HTTPException(status_code=404, detail="Application not found")

    application.status = payload.status
    session.commit()
    session.refresh(application)
    return application


@router.post("/jobs/{job_id}/publish", response_model=JobOut)
def publish_job(
    job_id: str,
    session: Session = Depends(get_session),
    current_user: models.User = Depends(get_current_user),
) -> JobOut:
    job = session.get(models.Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    _assert_membership(session, job.company_id, current_user.id)

    job.status = models.JobStatus.open
    job.visibility = models.JobVisibility.public
    session.commit()
    session.refresh(job)
    return _build_job_out(job)


@router.post("/jobs/{job_id}/unpublish", response_model=JobOut)
def unpublish_job(
    job_id: str,
    session: Session = Depends(get_session),
    current_user: models.User = Depends(get_current_user),
) -> JobOut:
    job = session.get(models.Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    _assert_membership(session, job.company_id, current_user.id)

    job.status = models.JobStatus.draft
    job.visibility = models.JobVisibility.private
    session.commit()
    session.refresh(job)
    return _build_job_out(job)


@router.get("/jobs", response_model=list[JobWithCountsOut])
def list_company_jobs(
    company_id: str,
    session: Session = Depends(get_session),
    current_user: models.User = Depends(get_current_user),
) -> list[JobWithCountsOut]:
    _assert_membership(session, company_id, current_user.id)
    app_counts = (
        session.query(
            models.Application.job_id.label("job_id"),
            func.count(models.Application.id).label("applications_count"),
            func.sum(
                case(
                    (models.Application.status == models.ApplicationStatus.reviewing, 1),
                    else_=0,
                )
            ).label("withheld_count"),
        )
        .group_by(models.Application.job_id)
        .subquery()
    )
    rows = (
        session.query(models.Job, app_counts.c.applications_count, app_counts.c.withheld_count)
        .outerjoin(app_counts, models.Job.id == app_counts.c.job_id)
        .filter(models.Job.company_id == company_id)
        .order_by(models.Job.created_at.desc())
        .all()
    )
    results: list[JobWithCountsOut] = []
    for job, applications_count, withheld_count in rows:
        job_out = _build_job_out(job)
        results.append(
            JobWithCountsOut(
                **job_out.dict(),
                applications_count=int(applications_count or 0),
                withheld_count=int(withheld_count or 0),
            )
        )
    return results


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
    results = query.order_by(models.CandidateProfile.updated_at.desc()).limit(50).all()
    return [_build_candidate_out(profile) for profile in results]
