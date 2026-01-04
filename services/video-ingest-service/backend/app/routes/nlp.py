import json
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI
from openai import OpenAI

from app import storage
from app.config import settings
import spacy
from spacy.language import Language

from app.schemas_nlp import (
    JobDraftFromVideoRequest,
    JobDraftRequest,
    JobDraftResponse,
    LocationFromTranscriptRequest,
    LocationFromTranscriptResponse,
    ProfileDraftRequest,
    ProfileDraftResponse,
)

router = APIRouter(prefix="/nlp", tags=["nlp"])

_openai_client: OpenAI | None = None
_spacy_nlp_cache: dict[str, Language] = {}

OPENAI_MAX_BYTES = 25 * 1024 * 1024


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


def get_spacy_nlp(model_name: str | None = None, strict: bool = True) -> Language | None:
    """
    Load and cache a spaCy model by name. If strict is False and the model cannot be loaded,
    return None so callers can attempt a fallback model.
    """
    global _spacy_nlp_cache
    name = (model_name or settings.SPACY_MODEL or "en_core_web_sm").strip()
    if not name:
        raise HTTPException(status_code=500, detail="spaCy model name is empty")

    cached = _spacy_nlp_cache.get(name)
    if cached is not None:
        return cached

    try:
        nlp = spacy.load(name)
        _spacy_nlp_cache[name] = nlp
        return nlp
    except Exception as exc:  # noqa: BLE001
        if strict:
            raise HTTPException(
                status_code=500,
                detail=f"spaCy model '{name}' not available. Check SPACY_MODEL/SPACY_FALLBACK_MODEL and dependencies.",
            ) from exc
        return None


def _clean_location(text: str) -> str:
    return " ".join(text.split()).strip(",. ")


def _extract_location_spacy(text: str) -> str | None:
    primary_model = (settings.SPACY_MODEL or "en_core_web_sm").strip()
    fallback_model = (settings.SPACY_FALLBACK_MODEL or "xx_ent_wiki_sm").strip()
    model_order: list[str] = []
    for name in [primary_model, fallback_model]:
        if name and name not in model_order:
            model_order.append(name)

    print("TEXT :", text)
    for idx, model_name in enumerate(model_order):
        nlp = get_spacy_nlp(model_name, strict=idx == 0)
        if nlp is None:
            print(f"spaCy model '{model_name}' unavailable; skipping")
            continue
        doc = nlp(text)
        print(f"SPACY DOC ({model_name}) :", doc)
        for ent in doc.ents:
            if ent.label_ in ("GPE", "LOC"):
                guess = _clean_location(ent.text)
                if 2 <= len(guess) <= 60:
                    return guess
    return None


def _geocode_location(location: str) -> dict[str, Optional[str]]:
    """
    Best-effort geocode using Nominatim (OpenStreetMap). Keeps this optional and fails soft.
    """
    result = {"city": None, "region": None, "country": None, "postal_code": None, "latitude": None, "longitude": None}
    if not location:
        return result
    try:
        resp = httpx.get(
            "https://nominatim.openstreetmap.org/search",
            params={
                "format": "json",
                "limit": 1,
                "q": location,
                "addressdetails": 1,
                "accept-language": "en",
            },
            headers={"User-Agent": "zjobly-media-api/0.1"},
            timeout=4.0,
        )
        print("GEOCODE - RESP   : ", resp)
        if resp.status_code != 200:
            return result
        data = resp.json()
        if not isinstance(data, list) or not data:
            return result
        print("GEOCODE - DATA   : ", data)
        top = data[0]
        address = top.get("address") or {}
        result["city"] = (
            address.get("city")
            or address.get("town")
            or address.get("village")
            or address.get("hamlet")
            or address.get("municipality")
        )
        result["region"] = address.get("state") or address.get("region") or address.get("county")
        result["country"] = address.get("country")
        result["postal_code"] = address.get("postcode")
        result["latitude"] = top.get("lat")
        result["longitude"] = top.get("lon")

        if not any([result["city"], result["region"], result["country"], result["postal_code"]]):
            display = (top.get("display_name") or "").strip()
            if display:
                tokens = [t.strip() for t in display.split(",") if t.strip()]
                if tokens:
                    result["city"] = tokens[0]
                if len(tokens) >= 2:
                    result["country"] = tokens[-1]
                if len(tokens) >= 3:
                    result["region"] = tokens[-2]

        return result
    except Exception:
        return result


PROMPT_CONFIG_PATH = Path(__file__).resolve().parents[1] / "prompts" / "prompts.json"
_prompt_config_cache: dict[str, dict[str, object]] | None = None


def _load_prompt_config() -> dict[str, dict[str, object]]:
    global _prompt_config_cache
    if _prompt_config_cache is not None:
        return _prompt_config_cache
    if not PROMPT_CONFIG_PATH.exists():
        raise HTTPException(status_code=500, detail="Prompt config file is missing.")
    try:
        parsed = json.loads(PROMPT_CONFIG_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail="Prompt config JSON is invalid.") from exc
    if not isinstance(parsed, dict):
        raise HTTPException(status_code=500, detail="Prompt config must be a JSON object.")
    _prompt_config_cache = parsed
    return parsed


def _get_prompt_entry(key: str) -> dict[str, object]:
    config = _load_prompt_config()
    entry = config.get(key)
    if not isinstance(entry, dict):
        raise HTTPException(status_code=500, detail=f"Prompt '{key}' is missing or invalid.")
    return entry


def _require_prompt_str(entry: dict[str, object], field: str, prompt_key: str) -> str:
    value = entry.get(field)
    if not isinstance(value, str) or not value.strip():
        raise HTTPException(status_code=500, detail=f"Prompt '{prompt_key}' is missing '{field}'.")
    return value.strip()


def _get_prompt_float(entry: dict[str, object], field: str, prompt_key: str, default: float) -> float:
    if field not in entry:
        return default
    try:
        return float(entry[field])  # type: ignore[arg-type]
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=500, detail=f"Prompt '{prompt_key}' has invalid '{field}'."
        ) from exc


def _get_prompt_int(entry: dict[str, object], field: str, prompt_key: str, default: int | None) -> int | None:
    if field not in entry:
        return default
    value = entry[field]
    if value is None:
        return None
    try:
        return int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=500, detail=f"Prompt '{prompt_key}' has invalid '{field}'."
        ) from exc


def _build_prompt_settings(prompt_key: str) -> tuple[str, str, float, int | None, dict[str, object]]:
    entry = _get_prompt_entry(prompt_key)
    system_prompt = _require_prompt_str(entry, "system_prompt", prompt_key)
    model = _require_prompt_str(entry, "model", prompt_key)
    temperature = _get_prompt_float(entry, "temperature", prompt_key, 0.45)
    max_tokens = _get_prompt_int(entry, "max_tokens", prompt_key, None)
    response_format = entry.get("response_format", "json_object")
    model_kwargs: dict[str, object] = {}
    if response_format == "json_object":
        model_kwargs["response_format"] = {"type": "json_object"}
    elif response_format not in (None, "", "text"):
        raise HTTPException(
            status_code=500, detail=f"Prompt '{prompt_key}' has unsupported response_format."
        )
    return system_prompt, model, temperature, max_tokens, model_kwargs


def _build_chat_model(prompt_key: str) -> tuple[ChatOpenAI, str]:
    if not settings.OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not configured")
    system_prompt, model, temperature, max_tokens, model_kwargs = _build_prompt_settings(prompt_key)
    llm = ChatOpenAI(
        model=model,
        temperature=temperature,
        max_tokens=max_tokens,
        model_kwargs=model_kwargs,
    )
    return llm, system_prompt


def _normalize_keywords(raw_keywords: object) -> list[str]:
    if isinstance(raw_keywords, list):
        return [str(k).strip() for k in raw_keywords if str(k).strip()]
    if isinstance(raw_keywords, str):
        return [k.strip() for k in raw_keywords.split(",") if k.strip()]
    return []


def _download_object(object_key: str, dest_path: str) -> None:
    s3 = storage.get_s3_client()
    try:
        with open(dest_path, "wb") as file_obj:
            s3.download_fileobj(settings.S3_BUCKET_RAW, object_key, file_obj)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=404, detail="Video not found in storage") from exc


def _transcode_to_audio(input_path: str, output_path: str) -> None:
    command = [
        "ffmpeg",
        "-y",
        "-i",
        input_path,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-b:a",
        "64k",
        output_path,
    ]
    result = subprocess.run(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise HTTPException(status_code=500, detail="Failed to extract audio for transcription.")


def _transcribe_object(object_key: str) -> str:
    client = get_openai_client()
    model = settings.WHISPER_MODEL or "whisper-1"
    if model.lower() == "small":
        model = "whisper-1"
    with tempfile.TemporaryDirectory() as temp_dir:
        _, ext = os.path.splitext(object_key)
        input_path = os.path.join(temp_dir, f"input-media{ext or '.bin'}")
        _download_object(object_key, input_path)

        transcription_path = input_path
        if os.path.getsize(input_path) > OPENAI_MAX_BYTES:
            audio_path = os.path.join(temp_dir, "audio.mp3")
            _transcode_to_audio(input_path, audio_path)
            transcription_path = audio_path

        if os.path.getsize(transcription_path) > OPENAI_MAX_BYTES:
            raise HTTPException(status_code=413, detail="Transcription file exceeds OpenAI upload limit.")

        try:
            with open(transcription_path, "rb") as file_obj:
                response = client.audio.transcriptions.create(model=model, file=file_obj)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=502, detail="Could not transcribe the video") from exc
        return response.text


def _draft_from_transcript(transcript: str, language: str | None) -> JobDraftResponse:
    llm, system_prompt = _build_chat_model("job_draft")
    if language:
        system_prompt = f"{system_prompt} Respond in {language}."

    try:
        prompt = ChatPromptTemplate.from_messages([("system", system_prompt), ("user", "{transcript}")])
        response = (prompt | llm).invoke({"transcript": transcript})
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail="Could not generate a draft from the transcript") from exc

    content = getattr(response, "content", None)
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


def _draft_profile_from_transcript(transcript: str, language: str | None) -> ProfileDraftResponse:
    llm, system_prompt = _build_chat_model("profile_draft")
    if language:
        system_prompt = f"{system_prompt} Respond in {language}."

    try:
        prompt = ChatPromptTemplate.from_messages([("system", system_prompt), ("user", "{transcript}")])
        response = (prompt | llm).invoke({"transcript": transcript})
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail="Could not generate a profile draft from the transcript") from exc

    content = getattr(response, "content", None)
    if not content:
        raise HTTPException(status_code=500, detail="Empty response from the language model")

    try:
        parsed = json.loads(content)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail="Invalid response from the language model") from exc

    headline = (parsed.get("headline") or "").strip()
    summary = (parsed.get("summary") or parsed.get("profile") or "").strip()
    location = (parsed.get("location") or "").strip() or None

    # Fallbacks to ensure summary is not identical to headline and has some length
    if summary and headline and summary.strip().lower() == headline.strip().lower():
        summary = transcript[:200].strip()
    if len(summary.split()) < 10:
        summary = (summary + " " + transcript[:400]).strip()

    if not headline or not summary:
        raise HTTPException(status_code=500, detail="Missing headline or summary in the generated profile")

    return ProfileDraftResponse(headline=headline, summary=summary, location=location)


@router.post("/location-from-transcript", response_model=LocationFromTranscriptResponse)
def location_from_transcript(payload: LocationFromTranscriptRequest) -> LocationFromTranscriptResponse:
    text = (payload.transcript or "").strip()
    if not text:
        return LocationFromTranscriptResponse(location=None)

    transcript_snippet = text[:8000]
    try:
        location = _extract_location_spacy(transcript_snippet)
        print("SPAcy location:", location)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail="Failed to extract location from transcript") from exc

    geo = _geocode_location(location) if location else {"city": None, "region": None, "country": None, "postal_code": None}
    print("GEOCODER", {"input": location, "geo": geo})  # or logging.info(...)
    return LocationFromTranscriptResponse(
        location=location,
        city=geo.get("city"),
        region=geo.get("region"),
        country=geo.get("country"),
        postal_code=geo.get("postal_code"),
    )


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


@router.post("/profile-draft", response_model=ProfileDraftResponse)
def generate_profile_draft(payload: ProfileDraftRequest) -> ProfileDraftResponse:
    transcript = payload.transcript.strip()
    if len(transcript) < 20:
        raise HTTPException(status_code=400, detail="Transcript is too short to generate a profile draft")
    return _draft_profile_from_transcript(transcript, payload.language)
