import json
import os

import httpx
from celery import Celery
from openai import OpenAI

# Simple Celery app that will consume NLP jobs from Redis.
celery_app = Celery(
    "nlp",
    broker=os.getenv("REDIS_URL", "redis://redis:6379/0"),
)

# Listen on a dedicated queue to avoid consuming media/transcription messages.
celery_app.conf.task_default_queue = "nlp"

_openai_client: OpenAI | None = None


@celery_app.task(name="nlp.process_document")
def process_document(document_id: str, transcript: str, job_id: str | None = None) -> dict[str, object]:
    """
    Generate a job draft (title/description/keywords) from a transcript.
    TODO:
      - Call OpenAI embeddings (e.g., text-embedding-3-large) on transcript.
      - Upsert dense vector + metadata into Elasticsearch.
      - Persist generated fields to Postgres as needed.
    """
    draft = generate_job_draft(transcript)
    return {
        "status": "ok",
        "document_id": document_id,
        "job_id": job_id,
        "draft": draft,
    }


def get_openai_client() -> OpenAI:
    global _openai_client
    if _openai_client is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY is required for NLP generation")
        http_client = httpx.Client(trust_env=False)
        _openai_client = OpenAI(api_key=api_key, http_client=http_client)
    return _openai_client


def _normalize_keywords(raw_keywords: object) -> list[str]:
    if isinstance(raw_keywords, list):
        return [str(k).strip() for k in raw_keywords if str(k).strip()]
    if isinstance(raw_keywords, str):
        return [k.strip() for k in raw_keywords.split(",") if k.strip()]
    return []


def generate_job_draft(transcript: str) -> dict[str, object]:
    transcript_clean = (transcript or "").strip()
    if len(transcript_clean) < 30:
        raise ValueError("Transcript too short to generate a draft")

    client = get_openai_client()
    model = os.getenv("LLM_MODEL", "gpt-4o-mini")
    system_prompt = (
        "You turn raw spoken job transcripts into concise job postings. "
        "Output JSON with keys: title (max ~12 words), description (concise 80-140 words), "
        "and keywords (array of 3-8 short skill/location terms). "
        "Keep the tone clear and appealing, avoid fluff, and do not invent details that are not in the transcript."
    )
    completion = client.chat.completions.create(
        model=model,
        temperature=0.45,
        max_tokens=480,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": transcript_clean},
        ],
    )
    content = completion.choices[0].message.content if completion.choices else ""
    if not content:
        raise RuntimeError("Language model returned an empty response")

    parsed = json.loads(content)
    title = (parsed.get("title") or "").strip()
    description = (parsed.get("description") or parsed.get("job_description") or "").strip()
    keywords = _normalize_keywords(parsed.get("keywords") or parsed.get("tags") or [])

    if not title or not description:
        raise RuntimeError("Language model response missing title/description")

    return {
        "title": title,
        "description": description,
        "keywords": keywords,
    }
