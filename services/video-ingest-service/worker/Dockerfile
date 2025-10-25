FROM python:3.11-slim
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY ../backend/app ./app
ENV PYTHONUNBUFFERED=1
# Celery (or RQ) worker entrypoint
CMD ["celery", "-A", "app.celery_app.celery_app", "worker", "-l", "INFO", "-Q", "media"]
