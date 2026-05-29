"""Fetch and extract text content from a web page URL."""

import logging
import re
import httpx

logger = logging.getLogger(__name__)


async def read_url(url: str) -> str:
    """Fetch a web page and extract readable text content."""
    try:
        url = url.strip()
        if not url.startswith(("http://", "https://")):
            url = "https://" + url

        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.get(
                url,
                headers={
                    "User-Agent": "Mozilla/5.0 (compatible; FSAIBot/1.0)",
                    "Accept": "text/html,application/xhtml+xml,text/plain",
                },
            )
            if resp.status_code != 200:
                return f"Failed to fetch URL (status {resp.status_code}): {url}"

            content_type = resp.headers.get("content-type", "")
            text = resp.text

            if "text/plain" in content_type:
                return _truncate(text, url)

            # Strip HTML tags and extract text
            text = re.sub(r"<script[^>]*>.*?</script>", "", text, flags=re.DOTALL | re.IGNORECASE)
            text = re.sub(r"<style[^>]*>.*?</style>", "", text, flags=re.DOTALL | re.IGNORECASE)
            text = re.sub(r"<nav[^>]*>.*?</nav>", "", text, flags=re.DOTALL | re.IGNORECASE)
            text = re.sub(r"<header[^>]*>.*?</header>", "", text, flags=re.DOTALL | re.IGNORECASE)
            text = re.sub(r"<footer[^>]*>.*?</footer>", "", text, flags=re.DOTALL | re.IGNORECASE)
            text = re.sub(r"<!--.*?-->", "", text, flags=re.DOTALL)
            text = re.sub(r"<[^>]+>", " ", text)
            text = re.sub(r"&[a-zA-Z]+;", " ", text)
            text = re.sub(r"&#\d+;", " ", text)
            text = re.sub(r"\s+", " ", text).strip()

            if not text:
                return f"No readable text content found at: {url}"

            return _truncate(text, url)

    except httpx.ConnectError:
        return f"Could not connect to: {url}"
    except httpx.TimeoutException:
        return f"Request timed out for: {url}"
    except Exception as e:
        logger.error("read_url error for '%s': %s", url, e)
        return f"Error reading URL '{url}': {str(e)}"


def _truncate(text: str, url: str, max_chars: int = 3000) -> str:
    if len(text) <= max_chars:
        return f"Content from {url}:\n\n{text}"
    trimmed = text[:max_chars]
    last_period = trimmed.rfind(".")
    if last_period > max_chars // 2:
        trimmed = trimmed[: last_period + 1]
    else:
        trimmed += "..."
    return f"Content from {url} (truncated to {max_chars} chars):\n\n{trimmed}"
