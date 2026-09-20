import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings

from app.api.routes.memory import router as memory_router
from app.api.routes.react import router as react_router
from app.api.routes.pdf import router as pdf_router
from app.models.schemas import HealthResponse
from app.services.vector_service import check_connection

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="FS AI Services", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

if settings.cors_origin_list == ["*"]:
    logger.warning(
        "CORS_ORIGINS is '*' — any origin may call this service. "
        "Set it to your backend/frontend URL before deploying."
    )
if settings.enable_python_tool:
    logger.warning(
        "ENABLE_PYTHON_TOOL is on. The Python tool executes model-authored "
        "code behind a best-effort sandbox; keep it off on public deployments."
    )

app.include_router(memory_router, prefix="/api")
app.include_router(react_router, prefix="/api")
app.include_router(pdf_router, prefix="/api")


@app.get("/api/health", response_model=HealthResponse)
async def health():
    """Reports ok even when Qdrant is down.

    The vector store only powers semantic memory and PDF search; chat and
    tools work without it. Returning unhealthy here would make a hosting
    platform restart a service that is in fact serving traffic fine.
    """
    return HealthResponse(
        status="ok",
        qdrant_connected=check_connection(),
    )


@app.get("/")
async def root():
    """Free hosting tiers ping the root path to decide if the app is awake."""
    return {"service": "fs-ai-services", "status": "ok"}
