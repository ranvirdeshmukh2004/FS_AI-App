import { logger } from "../../utils/logger.js";

export async function wikipedia(query: string, maxResults = 3): Promise<string> {
  try {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=search&list=search&srsearch=${encodeURIComponent(query)}&srlimit=${maxResults}&format=json&origin=*`;
    const searchResp = await fetch(searchUrl, { signal: AbortSignal.timeout(10000) });
    const searchData = await searchResp.json() as { query?: { search?: { title: string }[] } };
    const titles = (searchData.query?.search || []).map((r) => r.title).slice(0, maxResults);

    if (titles.length === 0) return `No Wikipedia results for: ${query}`;

    const parts: string[] = [];
    for (const title of titles) {
      const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
      try {
        const summaryResp = await fetch(summaryUrl, { signal: AbortSignal.timeout(8000) });
        const summary = await summaryResp.json() as { title?: string; extract?: string };
        if (summary.extract) {
          parts.push(`**${summary.title}**\n${summary.extract.slice(0, 600)}${summary.extract.length > 600 ? "..." : ""}`);
        }
      } catch { /* skip individual failures */ }
    }

    return parts.length > 0 ? parts.join("\n\n---\n\n") : `No content found for: ${query}`;
  } catch (err) {
    logger.error({ err }, "Wikipedia search failed");
    return `Wikipedia search failed: ${err instanceof Error ? err.message : "unknown"}`;
  }
}
