import logging
import re
import httpx

logger = logging.getLogger(__name__)

WIKI_API = "https://en.wikipedia.org/w/api.php"


async def wikipedia_search(query: str, max_results: int = 3) -> str:
    """Search Wikipedia and return article summaries."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            # Step 1: Search for matching articles
            search_resp = await client.get(
                WIKI_API,
                params={
                    "action": "query",
                    "list": "search",
                    "srsearch": query,
                    "srlimit": max_results,
                    "format": "json",
                },
            )
            search_data = search_resp.json()
            search_results = search_data.get("query", {}).get("search", [])

            if not search_results:
                return f"No Wikipedia articles found for: {query}"

            # Step 2: Get summaries for top results
            titles = [r["title"] for r in search_results]
            summaries = []

            for title in titles:
                summary_resp = await client.get(
                    WIKI_API,
                    params={
                        "action": "query",
                        "titles": title,
                        "prop": "extracts",
                        "exintro": True,
                        "explaintext": True,
                        "format": "json",
                    },
                )
                summary_data = summary_resp.json()
                pages = summary_data.get("query", {}).get("pages", {})

                for page in pages.values():
                    extract = page.get("extract", "")
                    if extract:
                        # Trim to reasonable length
                        clean = extract.strip()
                        if len(clean) > 800:
                            # Cut at sentence boundary
                            cut = clean[:800]
                            last_period = cut.rfind(".")
                            if last_period > 400:
                                clean = cut[: last_period + 1]
                            else:
                                clean = cut + "..."

                        page_title = page.get("title", title)
                        url = f"https://en.wikipedia.org/wiki/{page_title.replace(' ', '_')}"
                        summaries.append(
                            f"## {page_title}\n"
                            f"URL: {url}\n\n"
                            f"{clean}"
                        )

            if not summaries:
                return f"Found articles but could not retrieve summaries for: {query}"

            return "\n\n---\n\n".join(summaries)

    except Exception as e:
        logger.error("Wikipedia search failed: %s", e)
        return f"Wikipedia search failed: {str(e)}"
