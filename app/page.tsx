"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import TerminalFrame from "@/components/TerminalFrame";
import CityPanel from "@/components/CityPanel";
import WatchStrip from "@/components/WatchStrip";
import StatusTicker from "@/components/StatusTicker";
import CitySearch from "@/components/CitySearch";
import type { TempMarket } from "@/lib/polymarket";

// Globe must be client-only (three.js + window refs).
const Globe = dynamic(() => import("@/components/Globe"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-[11px] uppercase tracking-[0.3em] text-ink-dim">
      ● booting globe<span className="blink">_</span>
    </div>
  ),
});

type MarketsByCity = Map<string, TempMarket[]>;

function groupByCity(markets: TempMarket[]): MarketsByCity {
  const m = new Map<string, TempMarket[]>();
  for (const row of markets) {
    const list = m.get(row.cityKey) ?? [];
    list.push(row);
    m.set(row.cityKey, list);
  }
  for (const list of m.values()) {
    list.sort((a, b) => {
      if (a.closed !== b.closed) return a.closed ? 1 : -1;
      return a.date.localeCompare(b.date);
    });
  }
  return m;
}

export default function Home() {
  const [markets, setMarkets] = useState<TempMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/markets")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.error) setError(d.error);
        else setMarkets(d.markets ?? []);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const byCity = useMemo(() => groupByCity(markets), [markets]);
  const selectedMarkets = selected ? byCity.get(selected) ?? null : null;

  const activeCount = markets.filter((m) => !m.closed).length;
  const resolvedCount = markets.length - activeCount;
  const cityCount = byCity.size;

  const status = (
    <span className="flex items-center gap-3">
      <span className="text-ink-dim">CITIES</span>
      <span className="phosphor">{cityCount}</span>
      <span className="text-ink-dim">OPEN</span>
      <span className="phosphor-amber">{activeCount}</span>
      <span className="text-ink-dim">RESOLVED</span>
      <span className="phosphor">{resolvedCount}</span>
      <CitySearch markets={markets} onSelect={setSelected} />
    </span>
  );

  return (
    <div className="flex min-h-screen w-full flex-col p-3 lg:p-5">
      <TerminalFrame
        status={status}
        className="flex-1 min-h-[calc(100vh-1.5rem)] lg:min-h-[calc(100vh-2.5rem)]"
      >
        <div className="flex h-full flex-col p-3">
          <WatchStrip
            markets={markets}
            selectedCityKey={selected}
            onSelect={setSelected}
          />
          <StatusTicker markets={markets} onPickCity={setSelected} />
          <div className="mt-3 flex flex-1 flex-col gap-3 lg:flex-row">
          {/* Globe column */}
          <section className="flex min-h-[480px] flex-1 flex-col">
            <div className="flex items-center justify-between pb-2 text-[10px] uppercase tracking-[0.3em] text-ink-dim">
              <span>› 3D · click a pin to drill in</span>
              {loading && <span className="phosphor">loading markets…</span>}
              {error && <span className="text-amber">error: {error}</span>}
            </div>
            <div className="relative flex-1 min-h-[480px]">
              <Globe
                markets={markets}
                selectedCityKey={selected}
                onSelectCity={(k) => setSelected(k)}
              />
            </div>
            <Legend />
          </section>

          {/* Detail column */}
          <section className="flex min-h-[480px] w-full shrink-0 flex-col lg:w-[560px] xl:w-[640px]">
            {selectedMarkets ? (
              <CityPanel
                cityMarkets={selectedMarkets}
                onClose={() => setSelected(null)}
              />
            ) : (
              <EmptyPanel loading={loading} cityCount={cityCount} />
            )}
          </section>
          </div>
        </div>
      </TerminalFrame>
    </div>
  );
}

function Legend() {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-4 text-[10px] uppercase tracking-[0.25em] text-ink-dim">
      <span className="flex items-center gap-2">
        <span className="inline-block h-2 w-2 rounded-full bg-amber" /> highest-temp market
      </span>
      <span className="flex items-center gap-2">
        <span className="inline-block h-2 w-2 rounded-full bg-cyan" /> lowest-temp market
      </span>
      <span className="flex items-center gap-2">
        <span className="inline-block h-2 w-2 rounded-full bg-ink-dim" /> resolved / closed
      </span>
      <span className="ml-auto phosphor">SRC: polymarket · open-meteo · windy · iowa asos</span>
    </div>
  );
}

function EmptyPanel({
  loading,
  cityCount,
}: {
  loading: boolean;
  cityCount: number;
}) {
  return (
    <div className="ascii-panel crt-scanlines flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="text-[11px] uppercase tracking-[0.3em] text-ink-dim">
        awaiting selection
      </div>
      <div className="phosphor text-sm">
        ◉ CLICK A CITY PIN<span className="blink">_</span>
      </div>
      <p className="max-w-sm text-[11px] leading-relaxed text-ink-dim">
        Pins mark cities with Polymarket temperature markets. Click one for
        available dates, the multi-model forecast, the Windy overlay, and the
        METAR history the market will resolve against.
      </p>
      <div className="mt-4 text-[11px] text-ink-dim">
        {loading ? "indexing markets…" : `${cityCount} cities indexed`}
      </div>
    </div>
  );
}
