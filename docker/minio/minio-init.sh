#!/bin/sh
set -e

MINIO_ENDPOINT="${MINIO_ENDPOINT:-http://minio:9000}"
MINIO_ROOT_USER="${MINIO_ROOT_USER:-minioadmin}"
MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-minioadmin}"
S3_BUCKET_RAW="${S3_BUCKET_RAW:-videos-raw}"
S3_BUCKET_HLS="${S3_BUCKET_HLS:-videos-hls}"

until mc alias set local "${MINIO_ENDPOINT}" "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}"; do
  echo "Waiting for MinIO..."
  sleep 2
done

mc mb --ignore-existing "local/${S3_BUCKET_RAW}"
mc mb --ignore-existing "local/${S3_BUCKET_HLS}"
mc cors set "local/${S3_BUCKET_RAW}" /config/cors.json
mc cors set "local/${S3_BUCKET_HLS}" /config/cors.json
