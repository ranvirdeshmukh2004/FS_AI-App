FROM python:3.12-slim

# Keep the image small and logs unbuffered so hosting platforms show them live.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Run as a non-root user. The Python tool spawns child processes, so the
# blast radius of anything escaping it should not include root.
RUN useradd --create-home --uid 10001 appuser && chown -R appuser:appuser /app
USER appuser

# Hosting platforms assign a port through $PORT; 8000 is the local default.
ENV PORT=8000
EXPOSE 8000

# Shell form so $PORT is expanded at runtime rather than taken literally.
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
