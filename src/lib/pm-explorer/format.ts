import { DISPLAY_TZ, DISPLAY_TZ_LABEL } from "./config";

export function formatSgt(isoOrUnix: string | number, withSeconds = false): string {
  const d =
    typeof isoOrUnix === "number"
      ? new Date(isoOrUnix > 1e12 ? isoOrUnix : isoOrUnix * 1000)
      : new Date(isoOrUnix);
  if (Number.isNaN(d.getTime())) return "—";
  const opts: Intl.DateTimeFormatOptions = {
    timeZone: DISPLAY_TZ,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    ...(withSeconds ? { second: "2-digit" } : {}),
    hour12: false,
  };
  return `${new Intl.DateTimeFormat("en-GB", opts).format(d)} ${DISPLAY_TZ_LABEL}`;
}

export function formatSgtShort(isoOrUnix: string | number): string {
  const d =
    typeof isoOrUnix === "number"
      ? new Date(isoOrUnix > 1e12 ? isoOrUnix : isoOrUnix * 1000)
      : new Date(isoOrUnix);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: DISPLAY_TZ,
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

export function unixToIso(ts: number): string {
  const ms = ts > 1e12 ? ts : ts * 1000;
  return new Date(ms).toISOString();
}

/** Bubble radius: r = k * sqrt(notional), capped. */
export function bubbleRadius(notionalUsdc: number, k = 2.2, cap = 28): number {
  if (!Number.isFinite(notionalUsdc) || notionalUsdc <= 0) return 3;
  return Math.min(cap, Math.max(3, k * Math.sqrt(notionalUsdc)));
}

export function formatUsd(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

export function formatCents(p: number): string {
  if (!Number.isFinite(p)) return "—";
  return `${Math.round(p * 100)}¢`;
}

export function shortAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr || "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function escapeText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
