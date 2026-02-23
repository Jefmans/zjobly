import json
import os
from pathlib import Path

from celery import Celery
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI

# Simple Celery app that will consume NLP jobs from Redis.
celery_app = Celery(
    "nlp",
    broker=os.getenv("REDIS_URL", "redis://redis:6379/0"),
)

# Listen on a dedicated queue to avoid consuming media/transcription messages.
celery_app.conf.task_default_queue = "nlp"

def _resolve_config_dir() -> Path:
    explicit = (os.getenv("ZJOBLY_CONFIG_DIR") or "").strip()
    if explicit:
        return Path(explicit)
    mounted = Path("/config")
    if mounted.exists():
        return mounted
    repo_root = Path(__file__).resolve().parents[2]
    root_config = repo_root / "config"
    if root_config.exists():
        return root_config
    return Path(__file__).resolve().parent / "config"


CONFIG_DIR = _resolve_config_dir()
PROMPT_CONFIG_PATH = CONFIG_DIR / "prompts.json"
RUNTIME_CONFIG_PATH = CONFIG_DIR / "runtime.json"
_prompt_config_cache: dict[str, dict[str, object]] | None = None
_runtime_config_cache: dict[str, object] | None = None


def _load_runtime_config() -> dict[str, object]:
    global _runtime_config_cache
    if _runtime_config_cache is not None:
        return _runtime_config_cache
    if not RUNTIME_CONFIG_PATH.exists():
        _runtime_config_cache = {}
        return _runtime_config_cache
    try:
        parsed = json.loads(RUNTIME_CONFIG_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        _runtime_config_cache = {}
        return _runtime_config_cache
    if not isinstance(parsed, dict):
        _runtime_config_cache = {}
        return _runtime_config_cache
    _runtime_config_cache = parsed
    return _runtime_config_cache


def _get_runtime_int(keys: tuple[str, ...], fallback: int) -> int:
    current: object = _load_runtime_config()
    for key in keys:
        if not isinstance(current, dict):
            return fallback
        current = current.get(key)
    try:
        parsed = int(current)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return fallback
    return parsed if parsed > 0 else fallback


JOB_DRAFT_MIN_TRANSCRIPT_CHARS = _get_runtime_int(("transcript", "jobDraftMinChars"), 30)


def _load_prompt_config() -> dict[str, dict[str, object]]:
    global _prompt_config_cache
    if _prompt_config_cache is not None:
        return _prompt_config_cache
    if not PROMPT_CONFIG_PATH.exists():
        raise RuntimeError("Prompt config file is missing.")
    try:
        parsed = json.loads(PROMPT_CONFIG_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise RuntimeError("Prompt config JSON is invalid.") from exc
    if not isinstance(parsed, dict):
        raise RuntimeError("Prompt config must be a JSON object.")
    _prompt_config_cache = parsed
    return parsed


def _get_prompt_entry(key: str) -> dict[str, object]:
    config = _load_prompt_config()
    entry = config.get(key)
    if not isinstance(entry, dict):
        raise RuntimeError(f"Prompt '{key}' is missing or invalid.")
    return entry


def _require_prompt_str(entry: dict[str, object], field: str, prompt_key: str) -> str:
    value = entry.get(field)
    if not isinstance(value, str) or not value.strip():
        raise RuntimeError(f"Prompt '{prompt_key}' is missing '{field}'.")
    return value.strip()


def _get_prompt_float(entry: dict[str, object], field: str, prompt_key: str, default: float) -> float:
    if field not in entry:
        return default
    try:
        return float(entry[field])  # type: ignore[arg-type]
    except (TypeError, ValueError) as exc:
        raise RuntimeError(f"Prompt '{prompt_key}' has invalid '{field}'.") from exc


def _get_prompt_int(entry: dict[str, object], field: str, prompt_key: str, default: int | None) -> int | None:
    if field not in entry:
        return default
    value = entry[field]
    if value is None:
        return None
    try:
        return int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError) as exc:
        raise RuntimeError(f"Prompt '{prompt_key}' has invalid '{field}'.") from exc


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
        raise RuntimeError(f"Prompt '{prompt_key}' has unsupported response_format.")
    return system_prompt, model, temperature, max_tokens, model_kwargs


def _build_chat_model(prompt_key: str) -> tuple[ChatOpenAI, str]:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is required for NLP generation")
    system_prompt, model, temperature, max_tokens, model_kwargs = _build_prompt_settings(prompt_key)
    llm = ChatOpenAI(
        model=model,
        temperature=temperature,
        max_tokens=max_tokens,
        model_kwargs=model_kwargs,
    )
    return llm, system_prompt


@celery_app.task(name="nlp.process_document")
def process_document(document_id: str, transcript: str, job_id: str | None = None) -> dict[str, object]:
    """
    Generate a job draft (title/description/keywords) from a transcript.
    """
    draft = generate_job_draft(transcript)
    return {
        "status": "ok",
        "document_id": document_id,
        "job_id": job_id,
        "draft": draft,
    }


def _normalize_keywords(raw_keywords: object) -> list[str]:
    if isinstance(raw_keywords, list):
        return [str(k).strip() for k in raw_keywords if str(k).strip()]
    if isinstance(raw_keywords, str):
        return [k.strip() for k in raw_keywords.split(",") if k.strip()]
    return []


def generate_job_draft(transcript: str) -> dict[str, object]:
    transcript_clean = (transcript or "").strip()
    if len(transcript_clean) < JOB_DRAFT_MIN_TRANSCRIPT_CHARS:
        raise ValueError("Transcript too short to generate a draft")

    llm, system_prompt = _build_chat_model("job_draft")
    prompt = ChatPromptTemplate.from_messages([("system", system_prompt), ("user", "{transcript}")])
    response = (prompt | llm).invoke({"transcript": transcript_clean})
    content = getattr(response, "content", "")
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
