"""
Document Search Tool — searches uploaded PDFs via Qdrant similarity search.
Returns only the top most-relevant passages to minimize token usage.
"""

import logging
from app.services.pdf_service import search_documents

logger = logging.getLogger(__name__)

_context: dict = {}

# Only return top 4 results, truncate each to 300 chars to save tokens
MAX_RESULTS = 4
MAX_CHUNK_CHARS = 300
MIN_RELEVANCE_SCORE = 0.15  # filter out very low relevance results


def set_doc_search_context(session_id: str, embedding_api_key: str | None = None):
    """Set context for doc_search. Called before each agent run."""
    _context["session_id"] = session_id
    _context["embedding_api_key"] = embedding_api_key


async def doc_search(query: str) -> str:
    """Search uploaded documents for relevant information."""
    session_id = _context.get("session_id")
    if not session_id:
        return "No documents available in this conversation."

    try:
        results = await search_documents(
            query=query,
            session_id=session_id,
            embedding_api_key=_context.get("embedding_api_key"),
            limit=MAX_RESULTS,
        )

        # Filter out low-relevance results
        results = [r for r in results if r["score"] >= MIN_RELEVANCE_SCORE]

        if not results:
            return f"No relevant information found in uploaded documents for: {query}"

        formatted = []
        for i, r in enumerate(results, 1):
            text = r["text"][:MAX_CHUNK_CHARS]
            if len(r["text"]) > MAX_CHUNK_CHARS:
                # Cut at last sentence boundary
                last_period = text.rfind(".")
                if last_period > MAX_CHUNK_CHARS // 2:
                    text = text[:last_period + 1]
                else:
                    text += "..."
            formatted.append(f"[{i}] {r['filename']}, Page {r['page']}:\n{text}")

        return "\n\n".join(formatted) + "\n\nCite sources as [filename, Page X]."

    except Exception as e:
        logger.error("doc_search failed: %s", e)
        return f"Document search failed: {str(e)}"
