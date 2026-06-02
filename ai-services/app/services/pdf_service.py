"""
PDF Processing Pipeline

1. Extract text from PDF (PyMuPDF)
2. Chunk text semantically (by page, then split large pages)
3. Store in Qdrant — with embeddings if API key available, or text-only for keyword search
"""

import logging
import uuid
import hashlib
from datetime import datetime

import fitz  # PyMuPDF

from app.services.vector_service import get_client, _ensure_collection
from app.config import settings
from qdrant_client.models import PointStruct, Filter, FieldCondition, MatchValue

logger = logging.getLogger(__name__)

CHUNK_SIZE = 800
CHUNK_OVERLAP = 100


def extract_pages(pdf_bytes: bytes) -> list[dict]:
    """Extract text from PDF, page by page."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    pages = []
    for i, page in enumerate(doc):
        text = page.get_text("text").strip()
        if not text:
            blocks = page.get_text("blocks")
            text = " ".join(b[4] for b in blocks if len(b) > 4 and isinstance(b[4], str)).strip()
        pages.append({"page": i + 1, "text": text})
    doc.close()
    return pages


def chunk_pages(pages: list[dict]) -> list[dict]:
    """Split pages into semantic chunks."""
    chunks = []
    for p in pages:
        text = p["text"]
        if not text:
            continue
        if len(text) <= CHUNK_SIZE:
            chunks.append({"page": p["page"], "text": text, "chunk_id": len(chunks)})
        else:
            paragraphs = text.split("\n\n")
            current = ""
            for para in paragraphs:
                if len(current) + len(para) + 2 > CHUNK_SIZE and current:
                    chunks.append({"page": p["page"], "text": current.strip(), "chunk_id": len(chunks)})
                    current = current[-CHUNK_OVERLAP:] + "\n\n" + para if CHUNK_OVERLAP else para
                else:
                    current = current + "\n\n" + para if current else para
            if current.strip():
                chunks.append({"page": p["page"], "text": current.strip(), "chunk_id": len(chunks)})
    return chunks


def _text_to_vector(text: str) -> list[float]:
    """
    Create a simple deterministic vector from text using character n-gram hashing.
    This allows Qdrant storage without an external embedding API.
    Not as good as real embeddings but enables keyword-based similarity.
    """
    dim = settings.embedding_dimensions
    vector = [0.0] * dim
    words = text.lower().split()
    for w in words:
        h = int(hashlib.md5(w.encode()).hexdigest(), 16)
        idx = h % dim
        vector[idx] += 1.0
    # Normalize
    norm = sum(v * v for v in vector) ** 0.5
    if norm > 0:
        vector = [v / norm for v in vector]
    return vector


async def _get_embedding(text: str, api_key: str | None) -> list[float]:
    """Get embedding — use OpenAI if key available, otherwise hash-based fallback."""
    if api_key:
        try:
            from app.services.embedding_service import generate_embedding
            return await generate_embedding(text, api_key)
        except Exception as e:
            logger.warning("OpenAI embedding failed, using fallback: %s", e)
    return _text_to_vector(text)


async def process_pdf(
    pdf_bytes: bytes,
    filename: str,
    session_id: str,
    doc_id: str,
    embedding_api_key: str | None = None,
) -> dict:
    """Full pipeline: extract → chunk → embed → store in Qdrant."""
    logger.info("Processing PDF: %s (doc_id=%s, session=%s)", filename, doc_id, session_id)

    pages = extract_pages(pdf_bytes)
    total_pages = len(pages)
    pages_with_text = sum(1 for p in pages if p["text"])

    chunks = chunk_pages(pages)
    logger.info("Extracted %d pages, %d chunks from %s", total_pages, len(chunks), filename)

    if not chunks:
        return {
            "doc_id": doc_id, "filename": filename, "pages": total_pages,
            "chunks": 0, "status": "empty",
            "message": "No text could be extracted from this PDF",
        }

    client = get_client()
    _ensure_collection()

    points = []
    for chunk in chunks:
        try:
            embedding = await _get_embedding(chunk["text"], embedding_api_key)
        except Exception as e:
            logger.error("Embedding failed for chunk %d: %s", chunk["chunk_id"], e)
            continue

        points.append(PointStruct(
            id=str(uuid.uuid4()),
            vector=embedding,
            payload={
                "text": chunk["text"],
                "session_id": session_id,
                "doc_id": doc_id,
                "filename": filename,
                "page": chunk["page"],
                "chunk_id": chunk["chunk_id"],
                "type": "pdf_chunk",
                "uploaded_at": datetime.utcnow().isoformat(),
            },
        ))

    if points:
        batch_size = 50
        for i in range(0, len(points), batch_size):
            client.upsert(collection_name=settings.collection_name, points=points[i:i + batch_size])

    logger.info("Stored %d vectors for %s", len(points), filename)

    return {
        "doc_id": doc_id, "filename": filename, "pages": total_pages,
        "pages_with_text": pages_with_text, "chunks": len(points), "status": "processed",
    }


async def search_documents(
    query: str,
    session_id: str,
    embedding_api_key: str | None = None,
    doc_id: str | None = None,
    limit: int = 8,
) -> list[dict]:
    """Search document chunks — uses same embedding method as indexing."""
    query_embedding = await _get_embedding(query, embedding_api_key)
    client = get_client()

    must_conditions = [
        FieldCondition(key="session_id", match=MatchValue(value=session_id)),
        FieldCondition(key="type", match=MatchValue(value="pdf_chunk")),
    ]
    if doc_id:
        must_conditions.append(FieldCondition(key="doc_id", match=MatchValue(value=doc_id)))

    results = client.query_points(
        collection_name=settings.collection_name,
        query=query_embedding,
        query_filter=Filter(must=must_conditions),
        limit=limit,
    )

    return [
        {
            "text": hit.payload.get("text", "") if hit.payload else "",
            "filename": hit.payload.get("filename", "") if hit.payload else "",
            "page": hit.payload.get("page", 0) if hit.payload else 0,
            "score": hit.score,
            "doc_id": hit.payload.get("doc_id", "") if hit.payload else "",
        }
        for hit in results.points
    ]
