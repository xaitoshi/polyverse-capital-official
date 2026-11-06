/**
 * SSRF-safe Polymarket explorer helpers.
 * Client already uses host proxies for gamma/clob/data-api; this endpoint
 * exposes health + a guarded resolve path that never fetches arbitrary URLs.
 */
const ALLOWED_PUBLIC_HOSTS = new Set(["polymarket.com", "www.polymarket.com"]);
const ALLOWED_API_HOSTS = new Set([
  "gamma-api.polymarket.com",
  "clob.polymarket.com",
  "data-api.polymarket.com",
]);

const ADAPTER_VERSIONS = {
  gammaEvents: "gammaEventsV1@2026-11-06",
  clobPrices: "clobPricesV1@2026-11-06",
  clobBook: "clobBookV1@2026-11-06",
  dataTrades: "dataTradesV2@2026-11-06",
  modelFair: "modelFairUnavailable@2026-11-06",
};

function isBlockedHostname(hostname) {
  const h = String(hostname || "").toLowerCase();
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) {
    return true;
  }
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }
  if (h === "::1" || h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) return true;
  return false;
}

function parsePolymarketInput(rawInput) {
  const raw = String(rawInput || "").trim();
  if (!raw) return { ok: false, code: "empty", reason: "Empty input" };

  const slugRe = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;
  if (!raw.includes("://") && !raw.includes("/") && !/\s/.test(raw) && slugRe.test(raw)) {
    return { ok: true, kind: "slug", eventSlug: raw.toLowerCase() };
  }

  if (/^https?:\/\//i.test(raw) || /^www\.polymarket\.com/i.test(raw) || /^polymarket\.com/i.test(raw)) {
    let url;
    try {
      url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    } catch {
      return { ok: false, code: "invalid", reason: "Invalid URL" };
    }
    const host = url.hostname.toLowerCase();
    if (isBlockedHostname(host) || !ALLOWED_PUBLIC_HOSTS.has(host)) {
      return { ok: false, code: "disallowed_host", reason: `Disallowed host: ${host}` };
    }
    if (url.username || url.password) {
      return { ok: false, code: "invalid", reason: "URL credentials are not allowed" };
    }
    const parts = url.pathname.replace(/\/+/g, "/").replace(/\/$/, "").split("/").filter(Boolean);
    if (parts[0] === "event" && parts[1]) {
      return { ok: true, kind: "url", eventSlug: parts[1], marketSlug: parts[2] };
    }
    if (parts[0] === "market" && parts[1]) {
      return { ok: true, kind: "url", marketSlug: parts[1] };
    }
    return { ok: false, code: "unsupported", reason: "This link type isn’t supported yet" };
  }

  return { ok: true, kind: "keyword", q: raw };
}

async function fetchJson(url, { timeoutMs = 15000 } = {}) {
  const u = new URL(url);
  if (!ALLOWED_API_HOSTS.has(u.hostname.toLowerCase()) || isBlockedHostname(u.hostname)) {
    throw new Error(`Refusing fetch to ${u.hostname}`);
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: "application/json", "User-Agent": "polyverse-visualise/1.0" },
      redirect: "manual",
    });
    if (res.status >= 300 && res.status < 400) {
      throw new Error("Redirects are not followed from explorer resolve");
    }
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const url = new URL(req.url, "http://localhost");
  const action = url.searchParams.get("action") || (req.method === "GET" ? "health" : "resolve");

  try {
    if (action === "health") {
      return res.status(200).json({
        ok: true,
        asOf: new Date().toISOString(),
        adapterVersions: ADAPTER_VERSIONS,
        allowedPublicHosts: [...ALLOWED_PUBLIC_HOSTS],
        allowedApiHosts: [...ALLOWED_API_HOSTS],
      });
    }

    if (action === "parse") {
      const raw = url.searchParams.get("raw") || "";
      return res.status(200).json(parsePolymarketInput(raw));
    }

    if (action === "resolve") {
      let body = {};
      if (req.method === "POST") {
        body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      } else {
        body = { raw: url.searchParams.get("raw") || "", kind: url.searchParams.get("kind") || "" };
      }
      const parsed = parsePolymarketInput(body.raw || "");
      if (!parsed.ok) return res.status(400).json(parsed);

      if (parsed.kind === "keyword") {
        const data = await fetchJson(
          `https://gamma-api.polymarket.com/public-search?q=${encodeURIComponent(parsed.q)}&limit_per_type=12`
        );
        return res.status(200).json({
          kind: "keyword",
          parsed,
          events: data.events || [],
          adapterVersions: ADAPTER_VERSIONS,
        });
      }

      if (parsed.eventSlug) {
        const data = await fetchJson(
          `https://gamma-api.polymarket.com/events?slug=${encodeURIComponent(parsed.eventSlug)}`
        );
        return res.status(200).json({
          kind: parsed.kind,
          parsed,
          events: data,
          adapterVersions: ADAPTER_VERSIONS,
        });
      }

      if (parsed.marketSlug) {
        const data = await fetchJson(
          `https://gamma-api.polymarket.com/markets?slug=${encodeURIComponent(parsed.marketSlug)}`
        );
        return res.status(200).json({
          kind: parsed.kind,
          parsed,
          markets: data,
          adapterVersions: ADAPTER_VERSIONS,
        });
      }

      return res.status(400).json({ ok: false, reason: "Nothing to resolve" });
    }

    return res.status(404).json({ error: "unknown action" });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
