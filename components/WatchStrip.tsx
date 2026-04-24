"use client";

import type { TempMarket } from "@/lib/polymarket";
import { useWatchlist } from "@/lib/useWatchlist";

type Props = {
  markets: TempMarket[];
  selectedCityKey: string | null;
  onSelect: (cityKey: string) => void;
};

// A horizontal row of starred cities. Each chip shows the city + the count
// of open markets so the watchlist doubles as a "what's live right now"
// ticker for the user's own tracked cities.
export default function WatchStrip({
  markets,
  selectedCityKey,
  onSelect,
}: Props) {
  const { cities, remove } = useWatchlist();

  if (!cities.length) return null;

  const byCity = new Map<string, TempMarket[]>();
  for (const m of markets) {
    const list = byCity.get(m.cityKey) ?? [];
    list.push(m);
    byCity.set(m.cityKey, list);
  }

  return (
    <div className="ascii-panel mt-2 flex items-center gap-2 overflow-x-auto px-2 py-1 slim-scroll">
      <span className="shrink-0 pr-2 text-[10px] uppercase tracking-[0.3em] text-ink-dim">
        watchlist
      </span>
      {cities.map((key) => {
        const list = byCity.get(key) ?? [];
        const first = list[0];
        const open = list.filter((m) => !m.closed).length;
        const isActive = selectedCityKey === key;
        return (
          <button
            key={key}
            onClick={() => onSelect(key)}
            className={
              "group flex shrink-0 items-center gap-2 border px-2 py-1 text-[10px] uppercase tracking-[0.2em] leading-none transition-colors " +
              (isActive
                ? "border-amber/70 bg-amber/10 phosphor-amber"
                : "border-panel-border/60 text-ink hover:bg-cyan/[0.1]")
            }
          >
            <span>★</span>
            <span className="phosphor">
              {first?.city.name || key}
            </span>
            <span className="text-ink-dim">·</span>
            <span
              className={
                open > 0 ? "phosphor-amber" : "text-ink-dim"
              }
            >
              {open} open
            </span>
            <span
              onClick={(e) => {
                e.stopPropagation();
                remove(key);
              }}
              className="ml-1 text-ink-dim opacity-0 transition-opacity group-hover:opacity-100 hover:text-amber"
              aria-label={`Unwatch ${first?.city.name ?? key}`}
            >
              ✕
            </span>
          </button>
        );
      })}
    </div>
  );
}
