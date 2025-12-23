import os

class Settings:
    DATABASE_URL: str = os.getenv("DATABASE_URL")
    REDIS_URL: str = os.getenv("REDIS_URL")
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    LLM_MODEL: str = os.getenv("LLM_MODEL", "gpt-4o-mini")
    S3_ENDPOINT: str = os.getenv("S3_ENDPOINT")
    S3_ACCESS_KEY: str = os.getenv("S3_ACCESS_KEY")
    S3_SECRET_KEY: str = os.getenv("S3_SECRET_KEY")
    S3_BUCKET_RAW: str = os.getenv("S3_BUCKET_RAW", "videos-raw")
    S3_BUCKET_HLS: str = os.getenv("S3_BUCKET_HLS", "videos-hls")
    MEDIA_MAX_DURATION_SEC: int = int(os.getenv("MEDIA_MAX_DURATION_SEC", "180"))
    MEDIA_PRESIGN_EXPIRY_SEC: int = int(os.getenv("MEDIA_PRESIGN_EXPIRY_SEC", "3600"))
    MEDIA_PLAY_SIGN_EXPIRY_SEC: int = int(os.getenv("MEDIA_PLAY_SIGN_EXPIRY_SEC", "3600"))
    MEDIA_CORS_ALLOWED_ORIGINS: list[str] = [
        origin.strip()
        for origin in os.getenv(
            "MEDIA_CORS_ALLOWED_ORIGINS",
            "https://zjobly.com,https://www.zjobly.com,http://localhost:5173,http://localhost",
        ).split(",")
        if origin.strip()
    ]
    WHISPER_MODEL: str = os.getenv("WHISPER_MODEL", "whisper-1")
    SPACY_MODEL: str = os.getenv("SPACY_MODEL", "xx_ent_wiki_sm")
    API_BASE_PATH: str = os.getenv("API_BASE_PATH", "")
    API_ROOT_PATH: str = os.getenv("API_ROOT_PATH", "")
    API_PREFIX: str = os.getenv("API_PREFIX", API_BASE_PATH)

settings = Settings()
