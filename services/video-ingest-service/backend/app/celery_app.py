import logging
import os
import subprocess
import tempfile
from typing import Optional

from celery import Celery
from openai import OpenAI

from app import storage
from app.config import settings

logger = logging.getLogger(__name__)

celery_app = Celery(
    "media",
    broker=settings.REDIS_URL,
)

# Default queue for media processing
celery_app.conf.task_default_queue = "media"

_openai_client: Optional[OpenAI] = None
OPENAI_MAX_BYTES = 25 * 1024 * 1024


def get_openai_client() -> OpenAI:
    """
    Lazily construct an OpenAI client so the worker can reuse connections.
    """
    global _openai_client
    if _openai_client is None:
        api_key = settings.OPENAI_API_KEY
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY is required to transcribe uploads")
        _openai_client = OpenAI(api_key=api_key)
    return _openai_client


def download_object_to_path(bucket: str, object_key: str, dest_path: str) -> None:
    """
    Download an object from MinIO into a local file path.
    """
    s3 = storage.get_s3_client()
    with open(dest_path, "wb") as file_obj:
        s3.download_fileobj(bucket, object_key, file_obj)


def transcode_to_audio(input_path: str, output_path: str) -> None:
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
        snippet = (result.stderr or "").strip()[-400:]
        raise RuntimeError(f"ffmpeg failed to extract audio: {snippet}")


def call_whisper(file_path: str) -> str:
    client = get_openai_client()
    # Normalize legacy model names to the hosted API variant.
    model = settings.WHISPER_MODEL or "whisper-1"
    if model.lower() == "small":
        model = "whisper-1"
    with open(file_path, "rb") as file_obj:
        response = client.audio.transcriptions.create(model=model, file=file_obj)
    return response.text


@celery_app.task(name="media.process_upload", bind=True, max_retries=3, default_retry_delay=30)
def process_upload(
    self,
    object_key: str,
    bucket: str,
    duration_seconds: float | None = None,
    source: str | None = None,
):
    """
    Pull the uploaded media from MinIO, send to Whisper for transcription, and enqueue NLP processing.
    """
    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            _, ext = os.path.splitext(object_key)
            input_path = os.path.join(temp_dir, f"input-media{ext or '.bin'}")
            download_object_to_path(bucket, object_key, input_path)

            transcription_path = input_path
            if os.path.getsize(input_path) > OPENAI_MAX_BYTES:
                audio_path = os.path.join(temp_dir, "audio.mp3")
                transcode_to_audio(input_path, audio_path)
                transcription_path = audio_path
            if os.path.getsize(transcription_path) > OPENAI_MAX_BYTES:
                raise ValueError("Transcription file exceeds OpenAI upload limit.")

            transcript = call_whisper(transcription_path)

        # Enqueue downstream NLP job with the transcript.
        celery_app.send_task(
            "nlp.process_document",
            args=[object_key, transcript],
            kwargs={"job_id": None},
            queue="nlp",  # route to dedicated NLP queue so other workers ignore it
        )

        logger.info(
            "Processed upload %s from bucket=%s (duration=%s, source=%s, transcript_chars=%s)",
            object_key,
            bucket,
            duration_seconds,
            source,
            len(transcript),
        )
        return {
            "status": "ok",
            "object_key": object_key,
            "bucket": bucket,
            "duration_seconds": duration_seconds,
            "source": source,
            "transcript_length": len(transcript),
        }
    except Exception as exc:  # noqa: BLE001
        logger.exception("Failed to process upload %s from bucket %s", object_key, bucket)
        raise self.retry(exc=exc)


@celery_app.task(name="media.process_audio_chunk", bind=True, max_retries=3, default_retry_delay=15)
def process_audio_chunk(
    self,
    session_id: str,
    chunk_index: int,
    object_key: str,
    bucket: str | None = None,
):
    """
    Transcribe a single audio chunk uploaded during recording and store the partial transcript.
    """
    bucket_to_use = bucket or settings.S3_BUCKET_RAW
    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            _, ext = os.path.splitext(object_key)
            input_path = os.path.join(temp_dir, f"chunk{ext or '.bin'}")
            download_object_to_path(bucket_to_use, object_key, input_path)

            transcription_path = input_path
            if os.path.getsize(input_path) > OPENAI_MAX_BYTES:
                audio_path = os.path.join(temp_dir, "audio.mp3")
                transcode_to_audio(input_path, audio_path)
                transcription_path = audio_path
            if os.path.getsize(transcription_path) > OPENAI_MAX_BYTES:
                raise ValueError("Audio chunk exceeds OpenAI upload limit.")

            transcript = call_whisper(transcription_path)

        transcript_key = storage.build_audio_transcript_object_key(session_id, chunk_index)
        storage.put_text_object(bucket_to_use, transcript_key, transcript)

        logger.info(
            "Transcribed audio chunk session=%s index=%s -> %s chars",
            session_id,
            chunk_index,
            len(transcript),
        )
        return {
            "status": "ok",
            "session_id": session_id,
            "chunk_index": chunk_index,
            "object_key": object_key,
            "transcript_length": len(transcript),
        }
    except Exception as exc:  # noqa: BLE001
        logger.exception("Failed to transcribe audio chunk %s index=%s", session_id, chunk_index)
        raise self.retry(exc=exc)


@celery_app.task(name="media.finalize_audio_session", bind=True, max_retries=6, default_retry_delay=10)
def finalize_audio_session(
    self,
    session_id: str,
    total_chunks: int,
    bucket: str | None = None,
):
    """
    Assemble all chunk transcripts for a session into a final transcript object.
    """
    bucket_to_use = bucket or settings.S3_BUCKET_RAW
    transcripts: list[str] = []
    missing: list[int] = []

    for idx in range(total_chunks):
        key = storage.build_audio_transcript_object_key(session_id, idx)
        try:
            text = storage.get_text_object(bucket_to_use, key)
        except FileNotFoundError:
            missing.append(idx)
            continue
        transcripts.append(text.strip())

    if missing:
        raise self.retry(exc=RuntimeError(f"Missing transcript chunks: {missing}"))

    final_text = "\n".join(t for t in transcripts if t)
    final_key = storage.build_audio_final_transcript_key(session_id)
    storage.put_text_object(bucket_to_use, final_key, final_text)

    logger.info(
        "Finalized audio session %s with %s chunks (%s chars)",
        session_id,
        total_chunks,
        len(final_text),
    )

    return {
        "status": "ok",
        "session_id": session_id,
        "total_chunks": total_chunks,
        "final_transcript_key": final_key,
        "transcript_length": len(final_text),
    }
