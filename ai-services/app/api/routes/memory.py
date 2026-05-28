from fastapi import APIRouter, HTTPException

from app.models.schemas import (
    EmbedRequest,
    EmbedResponse,
    SearchRequest,
    SearchResponse,
    SearchResult,
)
from app.services.embedding_service import generate_embedding
from app.services.vector_service import store_vector, search_vectors

router = APIRouter(prefix="/memory", tags=["memory"])


@router.post("/embed", response_model=EmbedResponse)
async def embed_text(req: EmbedRequest):
    try:
        embedding = await generate_embedding(req.text, req.api_key)
        point_id = store_vector(
            embedding=embedding,
            text=req.text,
            session_id=req.session_id,
            metadata=req.metadata,
        )
        return EmbedResponse(id=point_id, dimensions=len(embedding))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/search", response_model=SearchResponse)
async def search_memory(req: SearchRequest):
    try:
        embedding = await generate_embedding(req.query, req.api_key)
        results = search_vectors(
            embedding=embedding,
            limit=req.limit,
            session_id=req.session_id,
        )
        return SearchResponse(
            results=[SearchResult(**r) for r in results]
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
