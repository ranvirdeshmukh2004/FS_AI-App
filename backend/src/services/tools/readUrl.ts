import { logger } from "../../utils/logger.js";

export async function readUrl(url: string): Promise<string> {
  try {
    const resp = await fetch(url.trim(), {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AI-Assistant/1.0)" },
      signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) return `Failed to fetch ${url}: HTTP ${resp.status}`;

    const contentType = resp.headers.get("content-type") || "";
    if (!contentType.includes("text")) return `URL returned non-text content (${contentType})`;

    const html = await resp.text();

    // Strip scripts, styles, and HTML tags
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/\s{2,}/g, " ")
      .trim();

    return text.slice(0, 4000) + (text.length > 4000 ? "\n\n[content truncated]" : "");
  } catch (err) {
    logger.error({ err }, "readUrl failed");
    return `Failed to read ${url}: ${err instanceof Error ? err.message : "unknown"}`;
  }
}
