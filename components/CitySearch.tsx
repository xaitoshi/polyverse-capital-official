"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { TempMarket } from "@/lib/polymarket";

type Props = {
  markets: TempMarket[];
  onSelect: (cityKey: string) => void;
};

type SearchHit = {
  cityKey: string;
  name: string;
  country: string;
  countryCode: string;
  activeCount: number;
  totalCount: number;
  volume: number;
  score: number;
};

// Score a city against a query. Lower is better.
// 0 = exact start-of-string, 1 = word-start match, 2 = substring, 3+ = char-by-char
function scoreCity(
  q: string,
  name: string,
  country: string,
  code: string
): number | null {
  const hay = `${name} ${country} ${code}`.toLowerCase();
  const needle = q.toLowerCase().trim();
  if (!needle) return 0;

  if (hay.startsWith(needle)) return 0;
  // Word-start match: after any space
  const idx = hay.indexOf(" " + needle);
  if (idx !== -1) return 1;
  // Substring match
  const sub = hay.indexOf(needle);
  if (sub !== -1) return 2 + sub * 0.01;

  // Char-by-char subsequence (handles typos / abbreviations like "nyc" in
  // "new york city")
  let hi = 0;
  let qi = 0;
  let score = 3;
  while (hi < hay.length && qi < needle.length) {
    if (hay[hi] === needle[qi]) {
      qi += 1;
      score += 0.1;
    } else {
      score += 0.3;
    }
    hi += 1;
  }
  return qi === needle.length ? score : null;
}

function buildIndex(markets: TempMarket[]): SearchHit[] {
  const byCity = new Map<string, SearchHit>();
  for (const m of markets) {
    const existing = byCity.get(m.cityKey);
    if (!existing) {
      byCity.set(m.cityKey, {
        cityKey: m.cityKey,
        name: m.city.name,
        country: m.city.country,
        countryCode: m.city.countryCode,
        activeCount: m.closed ? 0 : 1,
        totalCount: 1,
        volume: m.volume,
        score: 0,
      });
    } else {
      existing.totalCount += 1;
      if (!m.closed) existing.activeCount += 1;
      existing.volume += m.volume;
    }
  }
  return [...byCity.values()];
}

export default function CitySearch({ markets, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const index = useMemo(() => buildIndex(markets), [markets]);

  const results = useMemo(() => {
    if (!q.trim()) {
      // Default view: cities with the most open markets.
      return index
        .slice()
        .sort((a, b) => b.activeCount - a.activeCount || b.volume - a.volume)
        .slice(0, 10);
    }
    return index
      .map((c) => {
        const s = scoreCity(q, c.name, c.country, c.countryCode);
        return s == null ? null : { ...c, score: s };
      })
      .filter((x): x is SearchHit => x !== null)
      .sort((a, b) => a.score - b.score)
      .slice(0, 10);
  }, [index, q]);

  // Global "/" shortcut to focus the search, Escape to close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't intercept if the user is typing in another input.
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 0);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Click-away to close the dropdown.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCursor(0);
  }, [q, open]);

  const commit = (hit: SearchHit) => {
    onSelect(hit.cityKey);
    setOpen(false);
    setQ("");
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => {
          setOpen(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className="inline-flex items-center gap-2 border border-panel-border/60 px-2 py-1 text-[10px] uppercase tracking-[0.22em] leading-none text-ink-dim hover:bg-cyan/[0.1] hover:text-ink"
      >
        <span className="phosphor">⌕ SEARCH</span>
        <span className="border border-panel-border/40 px-1 py-0.5 text-[9px] text-ink-dim">
          /
        </span>
      </button>

      {open && (
        <div className="ascii-panel absolute right-0 top-[calc(100%+6px)] z-50 w-[320px] overflow-hidden shadow-[0_12px_32px_rgba(0,0,0,0.5)]">
          <div className="ascii-panel-heading flex items-center gap-2 px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] leading-none">
            <span className="phosphor">⌕</span>
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setOpen(false);
                } else if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setCursor((c) => Math.min(c + 1, results.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setCursor((c) => Math.max(c - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  const hit = results[cursor];
                  if (hit) commit(hit);
                }
              }}
              placeholder="city or country…"
              className="flex-1 bg-transparent text-[11px] tracking-[0.1em] text-ink placeholder:text-ink-dim/60 focus:outline-none"
              autoComplete="off"
            />
            <span className="text-ink-dim">{results.length}</span>
          </div>
          <ul className="slim-scroll max-h-[280px] overflow-y-auto">
            {results.length === 0 && (
              <li className="px-3 py-3 text-[11px] text-ink-dim">
                no city matches. try a different term.
              </li>
            )}
            {results.map((hit, i) => (
              <li key={hit.cityKey}>
                <button
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => commit(hit)}
                  className={
                    "flex w-full items-center gap-3 px-3 py-1.5 text-left text-[11px] leading-none transition-colors " +
                    (i === cursor
                      ? "bg-cyan/[0.14] phosphor"
                      : "text-ink hover:bg-cyan/[0.06]")
                  }
                >
                  <span className="w-28 shrink-0 truncate">
                    {hit.name}
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.22em] text-ink-dim">
                    {hit.countryCode}
                  </span>
                  <span className="ml-auto flex items-center gap-2 text-[10px] uppercase tracking-[0.22em]">
                    <span
                      className={
                        hit.activeCount > 0
                          ? "phosphor-amber"
                          : "text-ink-dim"
                      }
                    >
                      {hit.activeCount} open
                    </span>
                    <span className="text-ink-dim">
                      / {hit.totalCount}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t border-panel-border/40 px-3 py-1 text-[9px] uppercase tracking-[0.22em] text-ink-dim">
            ↑↓ navigate · ⏎ select · esc close
          </div>
        </div>
      )}
    </div>
  );
}
