@echo off
REM ── ai-services local startup (Windows) ──
REM Uses Python 3 via the Windows Launcher (py.exe)
REM Run this from the ai-services\ directory

set QDRANT_HOST=localhost
set QDRANT_PORT=6333
set EMBEDDING_MODEL=text-embedding-3-small
set EMBEDDING_DIMENSIONS=1536

echo Starting ai-services on port 8001...
py -3 -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
