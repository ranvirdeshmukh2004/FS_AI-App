import { logger } from "../../utils/logger.js";

interface SearchResult { title: string; url: string; snippet: string }

async function duckduckgo(query: string, maxResults = 5): Promise<SearchResult[]> {
  try {
    const resp = await fetch("https://html.duckduckgo.com/html/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      body: `q=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(15000),
    });

    const html = await resp.text();
    const results: SearchResult[] = [];

    // Primary pattern
    const primary = /class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    let m: RegExpExecArray | null;
    while ((m = primary.exec(html)) !== null && results.length < maxResults) {
      const title = m[2].replace(/<[^>]+>/g, "").trim();
      const snippet = m[3].replace(/<[^>]+>/g, "").trim();
      if (title) results.push({ url: m[1], title, snippet });
    }

    // Fallback simpler pattern
    if (results.length === 0) {
      const links = html.matchAll(/class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g);
      const snips = [...html.matchAll(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g)];
      let i = 0;
      for (const link of links) {
        if (i >= maxResults) break;
        const title = link[2].replace(/<[^>]+>/g, "").trim();
        const snippet = snips[i]?.[1]?.replace(/<[^>]+>/g, "").trim() || "";
        if (title) results.push({ url: link[1], title, snippet });
        i++;
      }
    }

    return results.length > 0 ? results : [{ title: "No results", url: "", snippet: `No results for: ${query}` }];
  } catch (err) {
    logger.error({ err }, "DuckDuckGo search failed");
    return [{ title: "Search error", url: "", snippet: `Search failed: ${err instanceof Error ? err.message : "unknown"}` }];
  }
}

async function googleSearch(query: string, apiKey: string, cx: string, maxResults = 5): Promise<SearchResult[]> {
  try {
    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}&num=${Math.min(maxResults, 10)}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) throw new Error(`Google returned ${resp.status}`);
    const data = await resp.json() as { items?: { title: string; link: string; snippet: string }[] };
    return (data.items || []).slice(0, maxResults).map((i) => ({ title: i.title, url: i.link, snippet: i.snippet }));
  } catch {
    return duckduckgo(query, maxResults);
  }
}

export async function webSearch(
  query: string,
  engine = "duckduckgo",
  googleApiKey?: string,
  googleCx?: string,
  maxResults = 5,
): Promise<string> {
  const results = engine === "google" && googleApiKey && googleCx
    ? await googleSearch(query, googleApiKey, googleCx, maxResults)
    : await duckduckgo(query, maxResults);

  return results.map((r, i) => `[${i + 1}] ${r.title}\n    URL: ${r.url}\n    ${r.snippet}`).join("\n\n");
}
