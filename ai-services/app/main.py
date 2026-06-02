from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.memory import router as memory_router
from app.api.routes.react import router as react_router
from app.api.routes.pdf import router as pdf_router
from app.models.schemas import HealthResponse
from app.services.vector_service import check_connection

app = FastAPI(title="FS AI Services", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(memory_router, prefix="/api")
app.include_router(react_router, prefix="/api")
app.include_router(pdf_router, prefix="/api")


@app.get("/api/health", response_model=HealthResponse)
async def health():
    return HealthResponse(
        status="ok",
        qdrant_connected=check_connection(),
    )
