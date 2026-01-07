import json
import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx
from openai import OpenAI

from app import models
from app.config import settings

logger = logging.getLogger(__name__)

SEARCH_CONFIG_PATH = Path(__file__).resolve().parent / "search_config.json"
_config_cache: "SearchConfig | None" = None
_openai_client: OpenAI | None = None


@dataclass(frozen=True)
class SearchConfig:
    embedding_model: str
    embedding_dimensions: int
    default_radius_km: float
    distance_scale_km: float
    job_index: str
    candidate_index: str
    max_results: int


def _require_str(raw: dict[str, Any], key: str) -> str:
    value = raw.get(key)
    if not isinstance(value, str) or not value.strip():
        raise RuntimeError(f"Search config missing '{key}'.")
    return value.strip()


def _require_int(raw: dict[str, Any], key: str) -> int:
    value = raw.get(key)
    if not isinstance(value, int):
        raise RuntimeError(f"Search config '{key}' must be an integer.")
    return value


def _require_float(raw: dict[str, Any], key: str) -> float:
    value = raw.get(key)
    if not isinstance(value, (int, float)):
        raise RuntimeError(f"Search config '{key}' must be a number.")
    return float(value)


def get_search_config() -> SearchConfig:
    global _config_cache
    if _config_cache is not None:
        return _config_cache
    if not SEARCH_CONFIG_PATH.exists():
        raise RuntimeError("Search config file is missing.")
    parsed = json.loads(SEARCH_CONFIG_PATH.read_text(encoding="utf-8"))
    if not isinstance(parsed, dict):
        raise RuntimeError("Search config must be a JSON object.")
    _config_cache = SearchConfig(
        embedding_model=_require_str(parsed, "embedding_model"),
        embedding_dimensions=_require_int(parsed, "embedding_dimensions"),
        default_radius_km=_require_float(parsed, "default_radius_km"),
        distance_scale_km=_require_float(parsed, "distance_scale_km"),
        job_index=_require_str(parsed, "job_index"),
        candidate_index=_require_str(parsed, "candidate_index"),
        max_results=_require_int(parsed, "max_results"),
    )
    return _config_cache


def get_default_radius_km() -> float:
    return get_search_config().default_radius_km


def _get_openai_client() -> OpenAI:
    global _openai_client
    if _openai_client is None:
        if not settings.OPENAI_API_KEY:
            raise RuntimeError("OPENAI_API_KEY is not configured.")
        http_client = httpx.Client(trust_env=False)
        _openai_client = OpenAI(api_key=settings.OPENAI_API_KEY, http_client=http_client)
    return _openai_client


def _embed_text(text: str) -> list[float]:
    config = get_search_config()
    client = _get_openai_client()
    response = client.embeddings.create(model=config.embedding_model, input=text)
    return list(response.data[0].embedding)


def _elastic_url() -> str:
    return os.getenv("ELASTIC_URL", "http://elasticsearch:9200").rstrip("/")


def _elastic_request(
    method: str,
    path: str,
    json_body: dict[str, Any] | None = None,
    params: dict[str, Any] | None = None,
    timeout: float = 8.0,
) -> httpx.Response:
    url = f"{_elastic_url()}/{path.lstrip('/')}"
    response = httpx.request(method, url, json=json_body, params=params, timeout=timeout)
    if response.status_code >= 400:
        raise RuntimeError(f"Elastic request failed ({response.status_code}): {response.text}")
    return response


def _ensure_index(index_name: str, mapping: dict[str, Any]) -> None:
    head = httpx.request("HEAD", f"{_elastic_url()}/{index_name}", timeout=4.0)
    if head.status_code == 200:
        return
    if head.status_code != 404:
        raise RuntimeError(f"Elastic index check failed ({head.status_code}): {head.text}")
    _elastic_request("PUT", index_name, json_body={"mappings": mapping})


def _job_index_mapping(config: SearchConfig) -> dict[str, Any]:
    return {
        "properties": {
            "id": {"type": "keyword"},
            "company_id": {"type": "keyword"},
            "title": {"type": "text"},
            "description": {"type": "text"},
            "keywords": {"type": "keyword"},
            "status": {"type": "keyword"},
            "visibility": {"type": "keyword"},
            "search_text": {"type": "text"},
            "location": {"type": "geo_point"},
            "embedding": {
                "type": "dense_vector",
                "dims": config.embedding_dimensions,
                "index": True,
                "similarity": "cosine",
            },
            "updated_at": {"type": "date"},
        }
    }


def _candidate_index_mapping(config: SearchConfig) -> dict[str, Any]:
    return {
        "properties": {
            "id": {"type": "keyword"},
            "user_id": {"type": "keyword"},
            "headline": {"type": "text"},
            "summary": {"type": "text"},
            "keywords": {"type": "keyword"},
            "discoverable": {"type": "boolean"},
            "search_text": {"type": "text"},
            "location": {"type": "geo_point"},
            "embedding": {
                "type": "dense_vector",
                "dims": config.embedding_dimensions,
                "index": True,
                "similarity": "cosine",
            },
            "updated_at": {"type": "date"},
        }
    }


def _index_document(index_name: str, mapping: dict[str, Any], doc_id: str, payload: dict[str, Any]) -> None:
    _ensure_index(index_name, mapping)
    _elastic_request(
        "PUT",
        f"{index_name}/_doc/{doc_id}",
        json_body=payload,
        params={"refresh": "true"},
    )


def _clean_parts(parts: list[str | None]) -> str:
    cleaned = [part.strip() for part in parts if isinstance(part, str) and part.strip()]
    return "\n".join(cleaned)


def build_job_search_text(job: models.Job) -> str:
    keywords = ", ".join(job.keywords or []) if job.keywords else ""
    keyword_block = f"Keywords: {keywords}" if keywords else None
    return _clean_parts([job.title, job.description, keyword_block])


def build_candidate_search_text(profile: models.CandidateProfile) -> str:
    keywords = ", ".join(profile.keywords or []) if profile.keywords else ""
    keyword_block = f"Keywords: {keywords}" if keywords else None
    return _clean_parts([profile.headline, profile.summary, keyword_block])


def get_location_point(location_ref: models.Location | None) -> dict[str, float] | None:
    if not location_ref:
        return None
    try:
        if location_ref.latitude is None or location_ref.longitude is None:
            return None
        lat = float(location_ref.latitude)
        lon = float(location_ref.longitude)
    except (TypeError, ValueError):
        return None
    return {"lat": lat, "lon": lon}


def index_job(job: models.Job) -> None:
    text = build_job_search_text(job)
    if not text:
        return
    config = get_search_config()
    try:
        embedding = _embed_text(text)
        payload = {
            "id": job.id,
            "company_id": job.company_id,
            "title": job.title,
            "description": job.description,
            "keywords": job.keywords or [],
            "status": getattr(job.status, "value", job.status),
            "visibility": getattr(job.visibility, "value", job.visibility),
            "search_text": text,
            "location": get_location_point(job.location_ref),
            "embedding": embedding,
            "updated_at": job.updated_at.isoformat() if job.updated_at else None,
        }
        _index_document(config.job_index, _job_index_mapping(config), job.id, payload)
    except Exception:
        logger.exception("Failed to index job %s", job.id)


def index_candidate(profile: models.CandidateProfile) -> None:
    text = build_candidate_search_text(profile)
    if not text:
        return
    config = get_search_config()
    try:
        embedding = _embed_text(text)
        payload = {
            "id": profile.id,
            "user_id": profile.user_id,
            "headline": profile.headline,
            "summary": profile.summary,
            "keywords": profile.keywords or [],
            "discoverable": bool(profile.discoverable),
            "search_text": text,
            "location": get_location_point(profile.location_ref),
            "embedding": embedding,
            "updated_at": profile.updated_at.isoformat() if profile.updated_at else None,
        }
        _index_document(config.candidate_index, _candidate_index_mapping(config), profile.id, payload)
    except Exception:
        logger.exception("Failed to index candidate %s", profile.id)


def _vector_query(
    query_vector: list[float],
    filters: list[dict[str, Any]],
    location: dict[str, float] | None,
    radius_km: float | None,
    size: int,
) -> dict[str, Any]:
    config = get_search_config()
    scale_km = radius_km if radius_km is not None else config.distance_scale_km
    use_geo = bool(location)
    return {
        "size": size,
        "query": {
            "script_score": {
                "query": {"bool": {"filter": filters}},
                "script": {
                    "source": (
                        "double score = cosineSimilarity(params.query_vector, 'embedding') + 1.0; "
                        "if (params.use_geo && doc['location'].size() != 0) { "
                        "double distanceKm = doc['location'].arcDistance(params.lat, params.lon) / 1000.0; "
                        "double scale = params.scale_km; "
                        "if (scale > 0) { "
                        "double decay = Math.exp(-0.5 * Math.pow(distanceKm / scale, 2)); "
                        "score += decay; "
                        "} "
                        "} "
                        "return score;"
                    ),
                    "params": {
                        "query_vector": query_vector,
                        "use_geo": use_geo,
                        "lat": location["lat"] if location else 0.0,
                        "lon": location["lon"] if location else 0.0,
                        "scale_km": scale_km,
                    },
                },
            }
        },
    }


def search_job_ids(
    query_text: str,
    location: dict[str, float] | None,
    radius_km: float | None,
) -> list[str]:
    text = (query_text or "").strip()
    if len(text) < 8:
        return []
    config = get_search_config()
    try:
        vector = _embed_text(text)
        body = _vector_query(
            vector,
            [
                {"term": {"status": "open"}},
                {"term": {"visibility": "public"}},
            ],
            location,
            radius_km,
            config.max_results,
        )
        response = _elastic_request("POST", f"{config.job_index}/_search", json_body=body)
        hits = response.json().get("hits", {}).get("hits", [])
        return [hit.get("_id") for hit in hits if hit.get("_id")]
    except Exception:
        logger.exception("Elastic job search failed.")
        return []


def search_candidate_ids(
    query_text: str,
    location: dict[str, float] | None,
    radius_km: float | None,
) -> list[str]:
    text = (query_text or "").strip()
    if len(text) < 8:
        return []
    config = get_search_config()
    try:
        vector = _embed_text(text)
        body = _vector_query(
            vector,
            [{"term": {"discoverable": True}}],
            location,
            radius_km,
            config.max_results,
        )
        response = _elastic_request("POST", f"{config.candidate_index}/_search", json_body=body)
        hits = response.json().get("hits", {}).get("hits", [])
        return [hit.get("_id") for hit in hits if hit.get("_id")]
    except Exception:
        logger.exception("Elastic candidate search failed.")
        return []
