"use client";

import { useMemo } from "react";
import type { TempMarket } from "@/lib/polymarket";

type Props = {
  markets: TempMarket[];
  onPickCity?: (cityKey: string) => void;
};

type TickerItem = {
  kind: "upcoming" | "resolved" | "volume" | "divergence";
  city: string;
  cityKey: string;
  text: string;
  badgeClass: string;
};

function countdown(iso?: string): string {
  if (!iso) return "—";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "now";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h >= 24) return `${Math.floor(h / 24)}d`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// Build a feed of recent/upcoming events from the raw markets list. Pure;
// no network. Three buckets: resolving soon, just resolved, and top-volume
// open markets. Interleaved for variety.
function buildFeed(markets: TempMarket[]): TickerItem[] {
  const now = Date.now();
  const upcoming = markets
    .filter(
      (m) =>
        !m.closed &&
        m.endDate &&
        new Date(m.endDate).getTime() > now &&
        new Date(m.endDate).getTime() - now < 36 * 3600 * 1000
    )
    .sort(
      (a, b) =>
        new Date(a.endDate!).getTime() - new Date(b.endDate!).getTime()
    )
    .slice(0, 6)
    .map<TickerItem>((m) => ({
      kind: "upcoming",
      city: m.city.name,
      cityKey: m.cityKey,
      text: `${m.kind === "high" ? "HIGH" : "LOW"} · ${m.city.name} · resolves ${countdown(m.endDate)}`,
      badgeClass: "border-amber/70 text-amber",
    }));

  const resolved = markets
    .filter(
      (m) =>
        m.closed &&
        m.endDate &&
        now - new Date(m.endDate).getTime() < 72 * 3600 * 1000
    )
    .sort(
      (a, b) =>
        new Date(b.endDate!).getTime() - new Date(a.endDate!).getTime()
    )
    .slice(0, 6)
    .map<TickerItem>((m) => {
      // Top outcome likely reflects the resolved bucket.
      const top = m.outcomes[0];
      const tag = top && top.probability > 0.9 ? ` @ ${top.label}` : "";
      return {
        kind: "resolved",
        city: m.city.name,
        cityKey: m.cityKey,
        text: `RESOLVED · ${m.city.name} ${m.kind.toUpperCase()}${tag}`,
        badgeClass: "border-ink-dim/50 text-ink-dim",
      };
    });

  const volume = markets
    .filter((m) => !m.closed && m.volume > 0)
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 4)
    .map<TickerItem>((m) => ({
      kind: "volume",
      city: m.city.name,
      cityKey: m.cityKey,
      text: `TOP VOL · ${m.city.name} · $${Math.round(
        m.volume
      ).toLocaleString()}`,
      badgeClass: "border-cyan/70 text-cyan",
    }));

  // Interleave so the eye sees variety as it scrolls past.
  const out: TickerItem[] = [];
  const maxLen = Math.max(upcoming.length, resolved.length, volume.length);
  for (let i = 0; i < maxLen; i++) {
    if (upcoming[i]) out.push(upcoming[i]);
    if (resolved[i]) out.push(resolved[i]);
    if (volume[i]) out.push(volume[i]);
  }
  return out;
}

export default function StatusTicker({ markets, onPickCity }: Props) {
  const items = useMemo(() => buildFeed(markets), [markets]);
  if (!items.length) return null;
  // Double the list so the CSS marquee can loop seamlessly.
  const looped = [...items, ...items];

  return (
    <div className="ascii-panel relative mt-2 overflow-hidden">
      <div className="absolute inset-y-0 left-0 z-10 flex items-center gap-2 bg-[rgba(4,12,10,0.92)] px-3 py-1.5 text-[10px] uppercase tracking-[0.3em] phosphor">
        ● ticker
      </div>
      <div className="ticker-track flex items-center gap-6 whitespace-nowrap py-2 pl-28 text-[10px] uppercase tracking-[0.2em]">
        {looped.map((it, idx) => (
          <button
            key={`${it.kind}-${idx}-${it.cityKey}`}
            onClick={() => onPickCity?.(it.cityKey)}
            className="inline-flex items-center gap-2 hover:phosphor-amber"
          >
            <span className={`border px-1.5 py-0.5 leading-none ${it.badgeClass}`}>
              {it.kind === "upcoming"
                ? "⌛"
                : it.kind === "resolved"
                ? "⊙"
                : it.kind === "volume"
                ? "🔥"
                : "⚠"}
            </span>
            <span className="text-ink">{it.text}</span>
            <span className="text-ink-dim">·</span>
          </button>
        ))}
      </div>
    </div>
  );
}
