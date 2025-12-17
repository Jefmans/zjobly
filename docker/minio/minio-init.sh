#!/bin/sh
set -e

MINIO_ENDPOINT="${MINIO_ENDPOINT:-http://minio:9000}"
MINIO_ROOT_USER="${MINIO_ROOT_USER:-minioadmin}"
MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-minioadmin}"
S3_BUCKET_RAW="${S3_BUCKET_RAW:-videos-raw}"
S3_BUCKET_HLS="${S3_BUCKET_HLS:-videos-hls}"
RETRY_COUNT="${RETRY_COUNT:-60}"
RETRY_DELAY_SEC="${RETRY_DELAY_SEC:-2}"

retry() {
  desc="$1"
  shift
  attempt=1
  while [ "$attempt" -le "$RETRY_COUNT" ]; do
    if "$@"; then
      return 0
    fi
    if [ "$attempt" -eq "$RETRY_COUNT" ]; then
      echo "ERROR: $desc failed after $attempt attempts."
      return 1
    fi
    echo "Waiting for $desc... ($attempt/$RETRY_COUNT)"
    attempt=$((attempt + 1))
    sleep "$RETRY_DELAY_SEC"
  done
}

retry_optional() {
  desc="$1"
  shift
  attempt=1
  while [ "$attempt" -le "$RETRY_COUNT" ]; do
    if "$@"; then
      return 0
    fi
    if [ "$attempt" -eq "$RETRY_COUNT" ]; then
      echo "WARN: $desc failed after $attempt attempts; continuing."
      return 0
    fi
    echo "Waiting for $desc... ($attempt/$RETRY_COUNT)"
    attempt=$((attempt + 1))
    sleep "$RETRY_DELAY_SEC"
  done
}

retry "MinIO" mc alias set local "${MINIO_ENDPOINT}" "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}"

retry "bucket ${S3_BUCKET_RAW}" mc mb --ignore-existing "local/${S3_BUCKET_RAW}"
retry "bucket ${S3_BUCKET_HLS}" mc mb --ignore-existing "local/${S3_BUCKET_HLS}"

retry_optional "CORS for ${S3_BUCKET_RAW}" mc cors set "local/${S3_BUCKET_RAW}" /config/cors.json
retry_optional "CORS for ${S3_BUCKET_HLS}" mc cors set "local/${S3_BUCKET_HLS}" /config/cors.json

echo "MinIO init complete"