from pydantic import BaseModel


class EmbedRequest(BaseModel):
    text: str
    api_key: str
    session_id: str | None = None
    metadata: dict | None = None


class EmbedResponse(BaseModel):
    id: str
    dimensions: int


class SearchRequest(BaseModel):
    query: str
    api_key: str
    session_id: str | None = None
    limit: int = 5


class SearchResult(BaseModel):
    id: str
    text: str
    score: float
    metadata: dict | None = None


class SearchResponse(BaseModel):
    results: list[SearchResult]


class HealthResponse(BaseModel):
    status: str
    qdrant_connected: bool
