import json
from typing import List

from fastapi import APIRouter, HTTPException
from openai import OpenAI

from app.config import settings
from app.schemas_nlp import JobDraftRequest, JobDraftResponse

router = APIRouter(prefix="/nlp", tags=["nlp"])

_openai_client: OpenAI | None = None


def get_openai_client() -> OpenAI:
    global _openai_client
    if _openai_client is None:
        api_key = settings.OPENAI_API_KEY
        if not api_key:
            raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not configured")
        _openai_client = OpenAI(api_key=api_key)
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


@router.post("/job-draft", response_model=JobDraftResponse)
def generate_job_draft(payload: JobDraftRequest) -> JobDraftResponse:
    transcript = payload.transcript.strip()
    if len(transcript) < 30:
        raise HTTPException(status_code=400, detail="Transcript is too short to generate a draft")

    client = get_openai_client()
    model = settings.LLM_MODEL or "gpt-4o-mini"
    system_prompt = SYSTEM_PROMPT
    if payload.language:
        system_prompt = f"{SYSTEM_PROMPT} Respond in {payload.language}."

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
