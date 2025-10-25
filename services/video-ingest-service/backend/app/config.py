import os

class Settings:
    DATABASE_URL: str = os.getenv("DATABASE_URL")
    REDIS_URL: str = os.getenv("REDIS_URL")
    S3_ENDPOINT: str = os.getenv("S3_ENDPOINT")
    S3_ACCESS_KEY: str = os.getenv("S3_ACCESS_KEY")
    S3_SECRET_KEY: str = os.getenv("S3_SECRET_KEY")
    S3_BUCKET_RAW: str = os.getenv("S3_BUCKET_RAW", "videos-raw")
    S3_BUCKET_HLS: str = os.getenv("S3_BUCKET_HLS", "videos-hls")
    MEDIA_MAX_DURATION_SEC: int = int(os.getenv("MEDIA_MAX_DURATION_SEC", "180"))
    MEDIA_PRESIGN_EXPIRY_SEC: int = int(os.getenv("MEDIA_PRESIGN_EXPIRY_SEC", "3600"))
    MEDIA_PLAY_SIGN_EXPIRY_SEC: int = int(os.getenv("MEDIA_PLAY_SIGN_EXPIRY_SEC", "3600"))
    WHISPER_MODEL: str = os.getenv("WHISPER_MODEL", "small")

settings = Settings()
