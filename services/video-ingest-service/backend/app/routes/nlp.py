import io
import json
from typing import List

import httpx
from fastapi import APIRouter, HTTPException
from openai import OpenAI

from app import storage
from app.config import settings
from app.schemas_nlp import JobDraftFromVideoRequest, JobDraftRequest, JobDraftResponse

router = APIRouter(prefix="/nlp", tags=["nlp"])

_openai_client: OpenAI | None = None


def get_openai_client() -> OpenAI:
    global _openai_client
    if _openai_client is None:
        api_key = settings.OPENAI_API_KEY
        if not api_key:
            raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not configured")
        # Pass a plain httpx client without proxies/trust_env to avoid incompatible proxy kwargs.
        http_client = httpx.Client(trust_env=False)
        _openai_client = OpenAI(api_key=api_key, http_client=http_client)
    return _openai_client


SYSTEM_PROMPT = (
    "You turn raw spoken job transcripts into concise job postings. "
    "Output JSON with keys: title (max ~12 words), description (concise 80-140 words), "
    "and keywords (array of 3-8 short skill/location terms). "
    "Keep the tone clear and appealing, avoid fluff, and do not invent details that are not in the transcript."
)


def _normalize_keywords(raw_keywords) -> List[str]:
    if isinstance(raw_keywords, list):
        return [str(k).strip() for k in raw_keywords if str(k).strip()]
    if isinstance(raw_keywords, str):
        return [k.strip() for k in raw_keywords.split(",") if k.strip()]
    return []

def _fetch_media(object_key: str) -> io.BytesIO:
    s3 = storage.get_s3_client()
    try:
        resp = s3.get_object(Bucket=settings.S3_BUCKET_RAW, Key=object_key)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=404, detail="Video not found in storage") from exc
    data = resp["Body"].read()
    buf = io.BytesIO(data)
    buf.name = object_key.split("/")[-1] or "upload.bin"
    return buf


def _transcribe_object(object_key: str) -> str:
    client = get_openai_client()
    file_obj = _fetch_media(object_key)
    file_obj.seek(0)
    model = settings.WHISPER_MODEL or "whisper-1"
    if model.lower() == "small":
        model = "whisper-1"
    try:
        response = client.audio.transcriptions.create(model=model, file=file_obj)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail="Could not transcribe the video") from exc
    return response.text


def _draft_from_transcript(transcript: str, language: str | None) -> JobDraftResponse:
    client = get_openai_client()
    model = settings.LLM_MODEL or "gpt-4o-mini"
    system_prompt = SYSTEM_PROMPT
    if language:
        system_prompt = f"{SYSTEM_PROMPT} Respond in {language}."

    try:
        completion = client.chat.completions.create(
            model=model,
            temperature=0.45,
            max_tokens=480,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": transcript},
            ],
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail="Could not generate a draft from the transcript") from exc

    content = completion.choices[0].message.content if completion.choices else None
    if not content:
        raise HTTPException(status_code=500, detail="Empty response from the language model")

    try:
        parsed = json.loads(content)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail="Invalid response from the language model") from exc

    title = (parsed.get("title") or "").strip()
    description = (parsed.get("description") or parsed.get("job_description") or "").strip()
    keywords = _normalize_keywords(parsed.get("keywords") or parsed.get("tags") or [])

    if not title or not description:
        raise HTTPException(status_code=500, detail="Missing title or description in the generated draft")

    return JobDraftResponse(title=title, description=description, keywords=keywords)


@router.post("/job-draft", response_model=JobDraftResponse)
def generate_job_draft(payload: JobDraftRequest) -> JobDraftResponse:
    transcript = payload.transcript.strip()
    if len(transcript) < 30:
        raise HTTPException(status_code=400, detail="Transcript is too short to generate a draft")

    return _draft_from_transcript(transcript, payload.language)


@router.post("/job-draft-from-video", response_model=JobDraftResponse)
def generate_job_draft_from_video(payload: JobDraftFromVideoRequest) -> JobDraftResponse:
    object_key = payload.object_key.strip()
    if not object_key:
        raise HTTPException(status_code=400, detail="Missing object key")

    transcript = _transcribe_object(object_key).strip()
    if len(transcript) < 30:
        raise HTTPException(status_code=400, detail="Transcript is too short to generate a draft")

    draft = _draft_from_transcript(transcript, payload.language)
    draft.transcript = transcript
    return draft
