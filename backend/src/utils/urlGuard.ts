import { isProduction } from "../config/index.js";

/**
 * Blocks server-side requests to private address space.
 *
 * The custom-endpoint routes fetch a URL supplied by the caller, which
 * without this check is an open SSRF proxy into whatever network the
 * container sits in. Loopback and LAN targets stay allowed in development,
 * since pointing at a local vLLM or Ollama box is the whole feature.
 */

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "metadata.google.internal",
]);

// Cloud instance metadata — the classic SSRF credential-theft target.
const BLOCKED_EXACT_IPS = new Set(["169.254.169.254"]);

function isPrivateIPv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;

  const [a, b] = [Number(m[1]), Number(m[2])];
  if ([a, b, Number(m[3]), Number(m[4])].some((n) => n > 255)) return false;

  if (a === 10) return true;                          // 10.0.0.0/8
  if (a === 127) return true;                         // loopback
  if (a === 172 && b >= 16 && b <= 31) return true;   // 172.16.0.0/12
  if (a === 192 && b === 168) return true;            // 192.168.0.0/16
  if (a === 169 && b === 254) return true;            // link-local
  return false;
}

export interface UrlCheck {
  ok: boolean;
  reason?: string;
}

export function checkOutboundUrl(raw: string): UrlCheck {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "Not a valid URL" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: `Unsupported protocol: ${url.protocol}` };
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (BLOCKED_EXACT_IPS.has(host)) {
    return { ok: false, reason: "Cloud metadata endpoints are not allowed" };
  }

  // Private targets are legitimate when you are running this yourself.
  if (!isProduction) return { ok: true };

  if (url.protocol !== "https:") {
    return { ok: false, reason: "Only https endpoints are allowed in production" };
  }

  if (BLOCKED_HOSTNAMES.has(host) || isPrivateIPv4(host)) {
    return { ok: false, reason: "Private and loopback addresses are not allowed" };
  }

  if (host.startsWith("fc") || host.startsWith("fd") || host === "::1") {
    return { ok: false, reason: "Private IPv6 addresses are not allowed" };
  }

  if (host.endsWith(".internal") || host.endsWith(".local")) {
    return { ok: false, reason: "Internal hostnames are not allowed" };
  }

  return { ok: true };
}
