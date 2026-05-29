import logging
import httpx

logger = logging.getLogger(__name__)

DDGS_URL = "https://html.duckduckgo.com/html/"
GOOGLE_URL = "https://www.googleapis.com/customsearch/v1"


async def duckduckgo_search(query: str, max_results: int = 5) -> list[dict]:
    """Search DuckDuckGo and return results."""
    results = []
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.post(
                DDGS_URL,
                data={"q": query},
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                },
            )
            html = resp.text

            # Parse results from DuckDuckGo HTML
            import re

            # Extract result snippets
            snippet_pattern = re.compile(
                r'<a rel="nofollow" class="result__a" href="([^"]*)"[^>]*>(.*?)</a>.*?'
                r'<a class="result__snippet"[^>]*>(.*?)</a>',
                re.DOTALL,
            )
            matches = snippet_pattern.findall(html)

            for url, title, snippet in matches[:max_results]:
                # Clean HTML tags
                clean_title = re.sub(r"<[^>]+>", "", title).strip()
                clean_snippet = re.sub(r"<[^>]+>", "", snippet).strip()
                if clean_title and clean_snippet:
                    results.append(
                        {
                            "title": clean_title,
                            "url": url,
                            "snippet": clean_snippet,
                        }
                    )

            # Fallback: simpler parsing if regex didn't match
            if not results:
                link_pattern = re.compile(
                    r'class="result__a"[^>]*href="([^"]*)"[^>]*>(.*?)</a>', re.DOTALL
                )
                snippet_only = re.compile(
                    r'class="result__snippet"[^>]*>(.*?)</a>', re.DOTALL
                )
                links = link_pattern.findall(html)
                snippets = snippet_only.findall(html)
                for i, (url, title) in enumerate(links[:max_results]):
                    clean_title = re.sub(r"<[^>]+>", "", title).strip()
                    clean_snippet = (
                        re.sub(r"<[^>]+>", "", snippets[i]).strip()
                        if i < len(snippets)
                        else ""
                    )
                    if clean_title:
                        results.append(
                            {
                                "title": clean_title,
                                "url": url,
                                "snippet": clean_snippet,
                            }
                        )

    except Exception as e:
        logger.error("DuckDuckGo search failed: %s", e)

    if not results:
        results.append(
            {
                "title": "No results found",
                "url": "",
                "snippet": f"DuckDuckGo returned no results for: {query}",
            }
        )

    return results


async def google_search(
    query: str, api_key: str, cx: str, max_results: int = 5
) -> list[dict]:
    """Search Google Custom Search API. Requires API key and CX ID."""
    results = []
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                GOOGLE_URL,
                params={
                    "key": api_key,
                    "cx": cx,
                    "q": query,
                    "num": min(max_results, 10),
                },
            )
            if resp.status_code == 200:
                data = resp.json()
                for item in data.get("items", [])[:max_results]:
                    results.append(
                        {
                            "title": item.get("title", ""),
                            "url": item.get("link", ""),
                            "snippet": item.get("snippet", ""),
                        }
                    )
            else:
                logger.warning("Google search returned %d: %s", resp.status_code, resp.text)
    except Exception as e:
        logger.error("Google search failed: %s", e)

    if not results:
        # Fallback to DuckDuckGo
        logger.info("Google search failed/empty, falling back to DuckDuckGo")
        return await duckduckgo_search(query, max_results)

    return results


async def web_search(
    query: str,
    engine: str = "duckduckgo",
    google_api_key: str | None = None,
    google_cx: str | None = None,
    max_results: int = 5,
) -> str:
    """Unified web search interface. Returns formatted string for LLM consumption."""
    if engine == "google" and google_api_key and google_cx:
        results = await google_search(query, google_api_key, google_cx, max_results)
    else:
        results = await duckduckgo_search(query, max_results)

    if not results:
        return f"No search results found for: {query}"

    formatted = []
    for i, r in enumerate(results, 1):
        formatted.append(f"[{i}] {r['title']}\n    URL: {r['url']}\n    {r['snippet']}")

    return "\n\n".join(formatted)
