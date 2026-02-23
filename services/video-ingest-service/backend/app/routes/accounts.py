from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session, joinedload

from app.database import get_session
from app import models
from app import storage
from app.auth import (
    generate_session_token,
    hash_password,
    hash_session_token,
    normalize_username,
    verify_password,
)
from app.config import settings
from app.search import (
    build_candidate_search_text,
    build_job_search_text,
    get_default_radius_km,
    get_location_point,
    index_candidate,
    index_job,
    search_candidate_ids,
    search_job_ids,
)
from app.schemas_accounts import (
    ApplicationCreate,
    ApplicationDetailOut,
    ApplicationOut,
    ApplicationUpdate,
    ApplicationWithJobOut,
    CandidateProfileCreate,
    CandidateProfileOut,
    CandidateDevOut,
    CandidateInvitationOut,
    CandidateInvitationUpdate,
    CompanyCreate,
    CompanyDevOut,
    CompanyOut,
    FavoriteActionOut,
    JobCreate,
    JobOut,
    JobWithCountsOut,
)
from app.schemas_auth import AuthCredentialsIn, AuthStatusOut, AuthUserOut
from app.routes import nlp as nlp_routes

router = APIRouter(prefix="/accounts", tags=["accounts"])
AUTH_SESSION_MAX_AGE_SECONDS = max(1, settings.AUTH_SESSION_TTL_DAYS) * 24 * 60 * 60


def _auth_user_out(user: models.User) -> AuthUserOut:
    username = (user.username or "").strip()
    name = (user.full_name or username).strip() or username
    return AuthUserOut(
        id=user.id,
        username=username,
        name=name,
    )


def _set_auth_cookie(response: Response, request: Request, token: str) -> None:
    secure = settings.AUTH_COOKIE_SECURE or request.url.scheme == "https"
    response.set_cookie(
        key=settings.AUTH_COOKIE_NAME,
        value=token,
        max_age=AUTH_SESSION_MAX_AGE_SECONDS,
        expires=AUTH_SESSION_MAX_AGE_SECONDS,
        httponly=True,
        samesite="lax",
        secure=secure,
        path="/",
    )


def _clear_auth_cookie(response: Response, request: Request) -> None:
    secure = settings.AUTH_COOKIE_SECURE or request.url.scheme == "https"
    response.delete_cookie(
        key=settings.AUTH_COOKIE_NAME,
        httponly=True,
        samesite="lax",
        secure=secure,
        path="/",
    )


def _create_user_session(session: Session, user: models.User) -> str:
    token = generate_session_token()
    token_hash = hash_session_token(token)
    expires_at = datetime.utcnow() + timedelta(seconds=AUTH_SESSION_MAX_AGE_SECONDS)
    session.add(
        models.AuthSession(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=expires_at,
        )
    )
    return token


def get_current_user(
    request: Request,
    session: Session = Depends(get_session),
) -> models.User:
    token = (request.cookies.get(settings.AUTH_COOKIE_NAME) or "").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    token_hash = hash_session_token(token)
    auth_session = (
        session.query(models.AuthSession)
        .options(joinedload(models.AuthSession.user))
        .filter(models.AuthSession.token_hash == token_hash)
        .first()
    )
    if not auth_session:
        raise HTTPException(status_code=401, detail="Invalid session")
    if auth_session.expires_at <= datetime.utcnow():
        session.delete(auth_session)
        session.commit()
        raise HTTPException(status_code=401, detail="Session expired")
    if not auth_session.user or not auth_session.user.is_active:
        raise HTTPException(status_code=401, detail="User is inactive")
    return auth_session.user


@router.post("/auth/register", response_model=AuthUserOut)
def register_auth_user(
    payload: AuthCredentialsIn,
    request: Request,
    response: Response,
    session: Session = Depends(get_session),
) -> AuthUserOut:
    username = normalize_username(payload.name)
    if len(username) < 3:
        raise HTTPException(status_code=400, detail="Name must be at least 3 characters")

    existing = session.query(models.User).filter(models.User.username == username).first()
    if existing:
        raise HTTPException(status_code=400, detail="An account with this name already exists")

    user = models.User(
        username=username,
        full_name=" ".join(payload.name.strip().split()),
        password_hash=hash_password(payload.password),
    )
    session.add(user)
    session.flush()

    token = _create_user_session(session, user)
    session.commit()
    session.refresh(user)
    _set_auth_cookie(response, request, token)
    return _auth_user_out(user)


@router.post("/auth/login", response_model=AuthUserOut)
def login_auth_user(
    payload: AuthCredentialsIn,
    request: Request,
    response: Response,
    session: Session = Depends(get_session),
) -> AuthUserOut:
    username = normalize_username(payload.name)
    user = session.query(models.User).filter(models.User.username == username).first()
    if not user or not user.password_hash or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid name or password")
    if not user.is_active:
        raise HTTPException(status_code=401, detail="User is inactive")

    token = _create_user_session(session, user)
    session.commit()
    _set_auth_cookie(response, request, token)
    return _auth_user_out(user)


@router.post("/auth/logout", response_model=AuthStatusOut)
def logout_auth_user(
    request: Request,
    response: Response,
    session: Session = Depends(get_session),
) -> AuthStatusOut:
    token = (request.cookies.get(settings.AUTH_COOKIE_NAME) or "").strip()
    if token:
        token_hash = hash_session_token(token)
        (
            session.query(models.AuthSession)
            .filter(models.AuthSession.token_hash == token_hash)
            .delete(synchronize_session=False)
        )
        session.commit()
    _clear_auth_cookie(response, request)
    return AuthStatusOut(status="logged_out")


@router.get("/auth/me", response_model=AuthUserOut)
def get_auth_me(current_user: models.User = Depends(get_current_user)) -> AuthUserOut:
    return _auth_user_out(current_user)


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


@router.get("/companies/dev", response_model=list[CompanyDevOut])
def list_companies_dev(session: Session = Depends(get_session)) -> list[CompanyDevOut]:
    companies = (
        session.query(models.Company)
        .options(joinedload(models.Company.members).joinedload(models.CompanyMembership.user))
        .order_by(models.Company.name.asc())
        .all()
    )
    results: list[CompanyDevOut] = []
    for company in companies:
        membership = next((m for m in company.members if m.is_default), None)
        if not membership:
            membership = next((m for m in company.members if m.role == models.CompanyRole.admin), None)
        if not membership and company.members:
            membership = company.members[0]
        results.append(
            CompanyDevOut(
                id=company.id,
                name=company.name,
                website=company.website,
                default_user_id=membership.user_id if membership else None,
                default_user_email=membership.user.email if membership and membership.user else None,
            )
        )
    return results


@router.get("/candidates/dev", response_model=list[CandidateDevOut])
def list_candidates_dev(session: Session = Depends(get_session)) -> list[CandidateDevOut]:
    profiles = (
        session.query(models.CandidateProfile)
        .options(joinedload(models.CandidateProfile.user))
        .order_by(models.CandidateProfile.updated_at.desc())
        .all()
    )
    results: list[CandidateDevOut] = []
    for profile in profiles:
        results.append(
            CandidateDevOut(
                id=profile.id,
                user_id=profile.user_id,
                user_email=profile.user.email if profile.user else None,
                headline=profile.headline,
                location=profile.location,
                summary=profile.summary,
                discoverable=bool(profile.discoverable),
            )
        )
    return results


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
    index_candidate(profile)
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


def _build_invitation_out(
    invitation: models.CandidateInvitation,
    include_candidate: bool = False,
    include_company: bool = False,
) -> CandidateInvitationOut:
    return CandidateInvitationOut(
        id=invitation.id,
        company_id=invitation.company_id,
        candidate_id=invitation.candidate_id,
        status=invitation.status,
        created_at=invitation.created_at,
        updated_at=invitation.updated_at,
        invited_by_user_id=invitation.invited_by_user_id,
        candidate_profile=_build_candidate_out(invitation.candidate)
        if include_candidate and invitation.candidate
        else None,
        company=invitation.company if include_company else None,
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
    index_job(job)
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
    index_job(job)
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
    index_job(job)
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
    lat: Optional[float] = Query(None, description="Latitude for distance boost"),
    lon: Optional[float] = Query(None, description="Longitude for distance boost"),
    radius_km: Optional[float] = Query(None, description="Distance scale in kilometers"),
    session: Session = Depends(get_session),
    current_user: models.User = Depends(get_current_user),
) -> list[JobOut]:
    query_text = (q or "").strip()
    location_point: dict[str, float] | None = None
    effective_radius = radius_km if radius_km is not None else get_default_radius_km()

    if lat is not None and lon is not None:
        location_point = {"lat": float(lat), "lon": float(lon)}
    if not query_text:
        profile = (
            session.query(models.CandidateProfile)
            .options(joinedload(models.CandidateProfile.location_ref))
            .filter_by(user_id=current_user.id)
            .first()
        )
        if profile:
            query_text = build_candidate_search_text(profile)
            if location_point is None:
                location_point = get_location_point(profile.location_ref)

    if query_text:
        job_ids = search_job_ids(query_text, location_point, effective_radius)
        if job_ids:
            jobs = (
                session.query(models.Job)
                .options(joinedload(models.Job.location_ref))
                .filter(models.Job.id.in_(job_ids))
                .all()
            )
            job_map = {job.id: job for job in jobs}
            return [_build_job_out(job_map[job_id]) for job_id in job_ids if job_id in job_map]

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
    job_id: Optional[str] = Query(None, description="Match candidates to a specific job"),
    lat: Optional[float] = Query(None, description="Latitude for distance boost"),
    lon: Optional[float] = Query(None, description="Longitude for distance boost"),
    radius_km: Optional[float] = Query(None, description="Distance scale in kilometers"),
    session: Session = Depends(get_session),
    current_user: models.User = Depends(get_current_user),
) -> list[CandidateProfileOut]:
    # Company membership required to search candidates.
    membership = session.query(models.CompanyMembership).filter_by(user_id=current_user.id).first()
    if not membership:
        raise HTTPException(status_code=403, detail="Join a company to search candidates")

    query_text = (q or "").strip()
    location_point: dict[str, float] | None = None
    effective_radius = radius_km if radius_km is not None else get_default_radius_km()

    if lat is not None and lon is not None:
        location_point = {"lat": float(lat), "lon": float(lon)}

    if job_id:
        job = (
            session.query(models.Job)
            .options(joinedload(models.Job.location_ref))
            .filter_by(id=job_id)
            .first()
        )
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        _assert_membership(session, job.company_id, current_user.id)
        query_text = build_job_search_text(job)
        if location_point is None:
            location_point = get_location_point(job.location_ref)

    if query_text:
        candidate_ids = search_candidate_ids(query_text, location_point, effective_radius)
        if candidate_ids:
            profiles = (
                session.query(models.CandidateProfile)
                .options(joinedload(models.CandidateProfile.location_ref))
                .filter(models.CandidateProfile.id.in_(candidate_ids))
                .all()
            )
            profile_map = {profile.id: profile for profile in profiles}
            return [
                _build_candidate_out(profile_map[candidate_id])
                for candidate_id in candidate_ids
                if candidate_id in profile_map
            ]

    query = session.query(models.CandidateProfile).filter(models.CandidateProfile.discoverable.is_(True))
    if q:
        ilike = f"%{q}%"
        query = query.filter(models.CandidateProfile.headline.ilike(ilike))
    results = query.order_by(models.CandidateProfile.updated_at.desc()).limit(50).all()
    return [_build_candidate_out(profile) for profile in results]


@router.get("/candidates/favorites", response_model=list[CandidateProfileOut])
def list_candidate_favorites(
    company_id: str = Query(..., description="Company to scope favorites"),
    session: Session = Depends(get_session),
    current_user: models.User = Depends(get_current_user),
) -> list[CandidateProfileOut]:
    _assert_membership(session, company_id, current_user.id)

    accepted_invite = (
        session.query(models.CandidateInvitation.id)
        .filter(
            models.CandidateInvitation.company_id == company_id,
            models.CandidateInvitation.candidate_id == models.CandidateProfile.id,
            models.CandidateInvitation.status == models.InvitationStatus.accepted,
        )
        .exists()
    )

    favorites = (
        session.query(models.CandidateFavorite)
        .options(
            joinedload(models.CandidateFavorite.candidate).joinedload(models.CandidateProfile.location_ref)
        )
        .join(models.CandidateFavorite.candidate)
        .filter(
            models.CandidateFavorite.user_id == current_user.id,
            models.CandidateFavorite.company_id == company_id,
            or_(models.CandidateProfile.discoverable.is_(True), accepted_invite),
        )
        .order_by(models.CandidateFavorite.created_at.desc())
        .all()
    )
    return [
        _build_candidate_out(favorite.candidate)
        for favorite in favorites
        if favorite.candidate is not None
    ]


@router.post("/candidates/{candidate_id}/favorite", response_model=CandidateProfileOut)
def add_candidate_favorite(
    candidate_id: str,
    company_id: str = Query(..., description="Company to scope favorites"),
    session: Session = Depends(get_session),
    current_user: models.User = Depends(get_current_user),
) -> CandidateProfileOut:
    _assert_membership(session, company_id, current_user.id)

    candidate = (
        session.query(models.CandidateProfile)
        .options(joinedload(models.CandidateProfile.location_ref))
        .filter_by(id=candidate_id)
        .first()
    )
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    existing = (
        session.query(models.CandidateFavorite)
        .filter(
            models.CandidateFavorite.user_id == current_user.id,
            models.CandidateFavorite.company_id == company_id,
            models.CandidateFavorite.candidate_id == candidate_id,
        )
        .first()
    )
    if not existing:
        session.add(
            models.CandidateFavorite(
                user_id=current_user.id,
                company_id=company_id,
                candidate_id=candidate_id,
            )
        )
        session.commit()

    return _build_candidate_out(candidate)


@router.delete("/candidates/{candidate_id}/favorite", response_model=FavoriteActionOut)
def remove_candidate_favorite(
    candidate_id: str,
    company_id: str = Query(..., description="Company to scope favorites"),
    session: Session = Depends(get_session),
    current_user: models.User = Depends(get_current_user),
) -> FavoriteActionOut:
    _assert_membership(session, company_id, current_user.id)

    favorite = (
        session.query(models.CandidateFavorite)
        .filter(
            models.CandidateFavorite.user_id == current_user.id,
            models.CandidateFavorite.company_id == company_id,
            models.CandidateFavorite.candidate_id == candidate_id,
        )
        .first()
    )
    if favorite:
        session.delete(favorite)
        session.commit()

    return FavoriteActionOut(status="removed")


@router.get("/candidates/invitations", response_model=list[CandidateInvitationOut])
def list_company_invitations(
    company_id: str = Query(..., description="Company to scope invitations"),
    session: Session = Depends(get_session),
    current_user: models.User = Depends(get_current_user),
) -> list[CandidateInvitationOut]:
    _assert_membership(session, company_id, current_user.id)

    invitations = (
        session.query(models.CandidateInvitation)
        .options(
            joinedload(models.CandidateInvitation.candidate).joinedload(models.CandidateProfile.location_ref)
        )
        .filter(models.CandidateInvitation.company_id == company_id)
        .order_by(models.CandidateInvitation.created_at.desc())
        .all()
    )
    return [
        _build_invitation_out(invitation, include_candidate=True)
        for invitation in invitations
        if invitation.candidate is not None
    ]


@router.post("/candidates/{candidate_id}/invitations", response_model=CandidateInvitationOut)
def create_candidate_invitation(
    candidate_id: str,
    company_id: str = Query(..., description="Company to scope invitations"),
    session: Session = Depends(get_session),
    current_user: models.User = Depends(get_current_user),
) -> CandidateInvitationOut:
    _assert_membership(session, company_id, current_user.id)

    candidate = (
        session.query(models.CandidateProfile)
        .options(joinedload(models.CandidateProfile.location_ref))
        .filter_by(id=candidate_id)
        .first()
    )
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    invitation = (
        session.query(models.CandidateInvitation)
        .filter(
            models.CandidateInvitation.company_id == company_id,
            models.CandidateInvitation.candidate_id == candidate_id,
        )
        .first()
    )
    if not invitation:
        invitation = models.CandidateInvitation(
            company_id=company_id,
            candidate_id=candidate_id,
            invited_by_user_id=current_user.id,
            status=models.InvitationStatus.pending,
        )
        session.add(invitation)
        session.commit()
        session.refresh(invitation)
    elif invitation.status == models.InvitationStatus.rejected:
        invitation.status = models.InvitationStatus.pending
        invitation.invited_by_user_id = current_user.id
        session.commit()
        session.refresh(invitation)

    invitation.candidate = candidate
    return _build_invitation_out(invitation, include_candidate=True)


@router.get("/invitations", response_model=list[CandidateInvitationOut])
def list_candidate_invitations(
    session: Session = Depends(get_session),
    current_user: models.User = Depends(get_current_user),
) -> list[CandidateInvitationOut]:
    profile = session.query(models.CandidateProfile).filter_by(user_id=current_user.id).first()
    if not profile:
        return []

    invitations = (
        session.query(models.CandidateInvitation)
        .options(joinedload(models.CandidateInvitation.company))
        .filter(models.CandidateInvitation.candidate_id == profile.id)
        .order_by(models.CandidateInvitation.created_at.desc())
        .all()
    )
    return [_build_invitation_out(invitation, include_company=True) for invitation in invitations]


@router.patch("/invitations/{invitation_id}", response_model=CandidateInvitationOut)
def update_candidate_invitation(
    invitation_id: str,
    payload: CandidateInvitationUpdate,
    session: Session = Depends(get_session),
    current_user: models.User = Depends(get_current_user),
) -> CandidateInvitationOut:
    profile = session.query(models.CandidateProfile).filter_by(user_id=current_user.id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Candidate profile not found")

    invitation = session.get(models.CandidateInvitation, invitation_id)
    if not invitation or invitation.candidate_id != profile.id:
        raise HTTPException(status_code=404, detail="Invitation not found")

    if invitation.status == payload.status:
        return _build_invitation_out(invitation, include_company=True)

    if invitation.status != models.InvitationStatus.pending:
        raise HTTPException(status_code=400, detail="Invitation cannot be updated")

    invitation.status = payload.status
    session.commit()
    session.refresh(invitation)
    return _build_invitation_out(invitation, include_company=True)
