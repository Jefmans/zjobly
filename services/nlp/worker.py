import os
from typing import Optional

from celery import Celery

# Simple Celery app that will consume NLP jobs from Redis.
celery_app = Celery(
    "nlp",
    broker=os.getenv("REDIS_URL", "redis://redis:6379/0"),
)

# Listen on a dedicated queue to avoid consuming media/transcription messages.
celery_app.conf.task_default_queue = "nlp"


@celery_app.task(name="nlp.process_document")
def process_document(document_id: str, transcript: str, job_id: Optional[str] = None) -> dict:
    """
    Placeholder NLP task.
    TODO:
      - Call OpenAI embeddings (e.g., text-embedding-3-large) on transcript.
      - Generate keywords and title/description via an LLM prompt.
      - Upsert dense vector + metadata into Elasticsearch.
      - Persist generated fields to Postgres as needed.
    """
    return {
        "status": "not_implemented",
        "document_id": document_id,
        "job_id": job_id,
    }
