"""
Document Search Tool — searches uploaded PDFs via Qdrant.
Works with or without an embedding API key (falls back to keyword matching).
"""

import logging
from app.services.pdf_service import search_documents

logger = logging.getLogger(__name__)

_context: dict = {}


def set_doc_search_context(session_id: str, embedding_api_key: str | None = None):
    """Set context for doc_search. Called before each agent run."""
    _context["session_id"] = session_id
    _context["embedding_api_key"] = embedding_api_key


async def doc_search(query: str) -> str:
    """Search uploaded documents for relevant information."""
    session_id = _context.get("session_id")
    if not session_id:
        return "No documents available. No session context provided."

    try:
        results = await search_documents(
            query=query,
            session_id=session_id,
            embedding_api_key=_context.get("embedding_api_key"),
            limit=6,
        )

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
            + "\n\nIMPORTANT: Only use information from these passages. "
            "Include citations with filename and page number."
        )

    except Exception as e:
        logger.error("doc_search failed: %s", e)
        return f"Document search failed: {str(e)}"
