import { ALLOWED_PUBLIC_HOSTS } from "./config";
import type { UrlParseResult } from "./types";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;

/**
 * Last path segment that looks like a Polymarket event/market slug.
 * Used for market-bearing paths such as /esports/.../<event-slug>.
 */
export function extractTrailingSlug(parts: string[]): string | undefined {
  for (let i = parts.length - 1; i >= 0; i--) {
    const seg = parts[i];
    if (SLUG_RE.test(seg)) return seg.toLowerCase();
  }
  return undefined;
}

/**
 * Parse keyword / Polymarket URL / bare slug without fetching.
 * Never follows redirects; rejects non-allowlisted hosts (SSRF guard).
 */
export function parseExplorerInput(rawInput: string): UrlParseResult {
  const raw = rawInput.trim();
  if (!raw) return { ok: false, reason: "Empty input", code: "empty" };

  // Bare slug (no scheme, no spaces)
  if (!raw.includes("://") && !raw.includes("/") && !/\s/.test(raw) && SLUG_RE.test(raw)) {
    return { ok: true, kind: "slug", eventSlug: raw.toLowerCase() };
  }

  // Looks like URL
  if (
    /^https?:\/\//i.test(raw) ||
    raw.toLowerCase().startsWith("polymarket.com") ||
    raw.toLowerCase().startsWith("www.polymarket.com")
  ) {
    let url: URL;
    try {
      const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
      url = new URL(withScheme);
    } catch {
      return { ok: false, reason: "Invalid URL", code: "invalid" };
    }

    const host = url.hostname.toLowerCase();
    if (!ALLOWED_PUBLIC_HOSTS.has(host)) {
      return {
        ok: false,
        reason: `Disallowed host: ${host}. Only polymarket.com links are accepted.`,
        code: "disallowed_host",
      };
    }

    // Block obvious SSRF tricks in path/userinfo
    if (url.username || url.password) {
      return { ok: false, reason: "URL credentials are not allowed", code: "invalid" };
    }

    const parts = url.pathname.replace(/\/+/g, "/").replace(/\/$/, "").split("/").filter(Boolean);

    // /event/<event-slug> or /event/<event-slug>/<market-slug>
    if (parts[0] === "event" && parts[1]) {
      return {
        ok: true,
        kind: "url",
        eventSlug: parts[1].toLowerCase(),
        marketSlug: parts[2]?.toLowerCase(),
        rawHost: host,
      };
    }

    // /market/<slug> — treat slug as market slug; resolve via gamma markets?slug=
    if (parts[0] === "market" && parts[1]) {
      return {
        ok: true,
        kind: "url",
        marketSlug: parts[1].toLowerCase(),
        rawHost: host,
      };
    }

    // Any other market-bearing Polymarket path (e.g. /esports/lol/.../<event-slug>):
    // take the trailing slug-shaped segment as the event slug.
    const trailing = extractTrailingSlug(parts);
    if (trailing) {
      return {
        ok: true,
        kind: "url",
        eventSlug: trailing,
        rawHost: host,
      };
    }

    return {
      ok: false,
      reason: "This link type isn’t supported yet. Use /event/<slug>, /esports/…/<slug>, or paste a keyword.",
      code: "unsupported",
    };
  }

  // Keyword (caller should use classifyInput for kind=keyword)
  return { ok: true, kind: "slug" };
}

export function classifyInput(raw: string): {
  kind: "keyword" | "url" | "slug";
  parse: UrlParseResult;
} {
  const trimmed = raw.trim();
  if (!trimmed) return { kind: "keyword", parse: { ok: false, reason: "Empty", code: "empty" } };

  if (
    /^https?:\/\//i.test(trimmed) ||
    /^www\.polymarket\.com/i.test(trimmed) ||
    /^polymarket\.com/i.test(trimmed)
  ) {
    return { kind: "url", parse: parseExplorerInput(trimmed) };
  }
  if (!/\s/.test(trimmed) && SLUG_RE.test(trimmed) && trimmed.includes("-")) {
    return { kind: "slug", parse: parseExplorerInput(trimmed) };
  }
  // Free text keyword — parse unused for resolve path
  return {
    kind: "keyword",
    parse: { ok: true, kind: "slug" },
  };
}

/** Server-side: reject internal IPs / link-local / metadata hosts. */
export function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) {
    return true;
  }
  // IPv4 literal
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local / metadata
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  }
  // IPv6 local
  if (h === "::1" || h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) return true;
  return false;
}
