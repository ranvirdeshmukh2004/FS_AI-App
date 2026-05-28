import uuid
import logging

from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    MatchValue,
    PointStruct,
    VectorParams,
)

from app.config import settings

logger = logging.getLogger(__name__)

_client: QdrantClient | None = None


def get_client() -> QdrantClient:
    global _client
    if _client is None:
        _client = QdrantClient(host=settings.qdrant_host, port=settings.qdrant_port)
        _ensure_collection()
    return _client


def _ensure_collection():
    client = _client
    assert client is not None
    collections = [c.name for c in client.get_collections().collections]
    if settings.collection_name not in collections:
        client.create_collection(
            collection_name=settings.collection_name,
            vectors_config=VectorParams(
                size=settings.embedding_dimensions,
                distance=Distance.COSINE,
            ),
        )
        logger.info("Created Qdrant collection: %s", settings.collection_name)


def store_vector(
    embedding: list[float],
    text: str,
    session_id: str | None = None,
    metadata: dict | None = None,
) -> str:
    client = get_client()
    point_id = str(uuid.uuid4())
    payload = {"text": text, **(metadata or {})}
    if session_id:
        payload["session_id"] = session_id

    client.upsert(
        collection_name=settings.collection_name,
        points=[PointStruct(id=point_id, vector=embedding, payload=payload)],
    )
    return point_id


def search_vectors(
    embedding: list[float],
    limit: int = 5,
    session_id: str | None = None,
) -> list[dict]:
    client = get_client()

    query_filter = None
    if session_id:
        query_filter = Filter(
            must=[FieldCondition(key="session_id", match=MatchValue(value=session_id))]
        )

    results = client.query_points(
        collection_name=settings.collection_name,
        query=embedding,
        query_filter=query_filter,
        limit=limit,
    )

    return [
        {
            "id": str(hit.id),
            "text": hit.payload.get("text", "") if hit.payload else "",
            "score": hit.score,
            "metadata": {
                k: v
                for k, v in (hit.payload or {}).items()
                if k not in ("text", "session_id")
            },
        }
        for hit in results.points
    ]


def check_connection() -> bool:
    try:
        get_client().get_collections()
        return True
    except Exception:
        return False
