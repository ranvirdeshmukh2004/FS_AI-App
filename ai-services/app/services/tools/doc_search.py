"""
Document Search Tool — searches uploaded PDFs via Qdrant vector similarity.

Used by the ReAct agent when user asks about uploaded documents.
Requires session_id and embedding_api_key to be passed in context.
"""

import logging
from app.services.embedding_service import generate_embedding
from app.services.pdf_service import search_documents

logger = logging.getLogger(__name__)

# These are set per-request by the agent before calling
_context: dict = {}


def set_doc_search_context(session_id: str, embedding_api_key: str):
    """Set the context for doc_search. Called before each agent run."""
    _context["session_id"] = session_id
    _context["embedding_api_key"] = embedding_api_key


async def doc_search(query: str) -> str:
    """Search uploaded documents for relevant information."""
    session_id = _context.get("session_id")
    api_key = _context.get("embedding_api_key")

    if not session_id:
        return "No documents available. No session context provided."
    if not api_key:
        return "Document search unavailable — no embedding API key configured."

    try:
        embedding = await generate_embedding(query, api_key)
        results = search_documents(embedding, session_id, limit=6)

        if not results:
            return f"No relevant information found in uploaded documents for: {query}"

        formatted = []
        for i, r in enumerate(results, 1):
            score_pct = round(r["score"] * 100, 1)
            formatted.append(
                f"[{i}] {r['filename']} — Page {r['page']} (relevance: {score_pct}%)\n"
                f"{r['text'][:500]}"
            )

        return (
            f"Found {len(results)} relevant passages from uploaded documents:\n\n"
            + "\n\n---\n\n".join(formatted)
            + "\n\n⚠️ IMPORTANT: Only use information from these passages. "
            "Include citations with filename and page number."
        )

    except Exception as e:
        logger.error("doc_search failed: %s", e)
        return f"Document search failed: {str(e)}"
