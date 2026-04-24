"use client";

import { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { TempMarket } from "@/lib/polymarket";
import type { PricePoint } from "@/lib/prices";

type Props = {
  market: TempMarket | null;
  // When true, render only the chart body (no ascii-panel wrapper / header).
  // The parent is expected to supply those and set an explicit height.
  headless?: boolean;
};

// Rotating palette that stays readable on our dark theme. Kept short
// because we limit how many outcomes we overlay anyway.
const PALETTE = [
  "#ffb947", // amber
  "#5ef1ff", // cyan
  "#ff5ecc", // magenta
  "#7dff9b", // green
  "#c56eff", // violet
];

type Series = {
  label: string;
  tokenId: string;
  color: string;
  points: PricePoint[];
};

// Stitches the per-token series into a single shared-x dataset so Recharts
// can draw one LineChart with multiple `<Line>` children. We sample each
// series onto the union of all timestamps; for missing keys we leave
// undefined so Recharts skips the dot.
function buildMerged(series: Series[]) {
  if (!series.length) return [];
  const ts = new Set<number>();
  series.forEach((s) => s.points.forEach((p) => ts.add(p.t)));
  const xs = [...ts].sort((a, b) => a - b);
  const perTokenMap = series.map((s) => {
    const m = new Map<number, number>();
    s.points.forEach((p) => m.set(p.t, p.p));
    return m;
  });
  return xs.map((t) => {
    const row: Record<string, number | string> = {
      t,
      label: new Date(t * 1000).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
    series.forEach((s, i) => {
      const v = perTokenMap[i].get(t);
      if (v != null) row[s.label] = v;
    });
    return row;
  });
}

export default function MarketPriceHistory({ market, headless = false }: Props) {
  const [series, setSeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState(false);

  // The top 5 outcomes with a token ID. More would clutter the chart and
  // slow the panel with extra CLOB fetches.
  const tracked = useMemo(() => {
    if (!market) return [];
    return market.outcomes
      .filter((o) => o.yesTokenId && o.probability >= 0.01)
      .slice(0, 5)
      .map((o, i) => ({
        label: o.label,
        tokenId: o.yesTokenId!,
        color: PALETTE[i % PALETTE.length],
      }));
  }, [market]);

  useEffect(() => {
    if (!tracked.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSeries([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all(
      tracked.map(async (t) => {
        try {
          const r = await fetch(
            `/api/price-history?token=${t.tokenId}&interval=1d`
          );
          const data = (await r.json()) as { history?: PricePoint[] };
          return { ...t, points: data.history ?? [] };
        } catch {
          return { ...t, points: [] };
        }
      })
    ).then((rows) => {
      if (cancelled) return;
      setSeries(rows.filter((r) => r.points.length));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [tracked]);

  const data = useMemo(() => buildMerged(series), [series]);

  if (!market) return null;

  const body =
    loading && !series.length ? (
      <div className="p-3 text-[11px] text-ink-dim">loading CLOB…</div>
    ) : !data.length ? (
      <div className="p-3 text-[11px] text-ink-dim">no trading yet.</div>
    ) : (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 6, right: 10, bottom: 4, left: -16 }}>
              <CartesianGrid
                stroke="rgba(94, 241, 255, 0.12)"
                strokeDasharray="2 3"
              />
              <XAxis
                dataKey="label"
                tick={{ fill: "#7fa990", fontSize: 9 }}
                stroke="rgba(94, 241, 255, 0.25)"
                minTickGap={30}
              />
              <YAxis
                domain={[0, 1]}
                tickFormatter={(v: number) => `${Math.round(v * 100)}`}
                tick={{ fill: "#7fa990", fontSize: 9 }}
                stroke="rgba(94, 241, 255, 0.25)"
                width={28}
              />
              <Tooltip
                contentStyle={{
                  background: "rgba(4, 12, 10, 0.95)",
                  border: "1px solid rgba(94, 241, 255, 0.4)",
                  fontFamily: "ui-monospace, monospace",
                  fontSize: 10,
                  color: "#c8f2d8",
                }}
                formatter={(v) => `${Math.round(Number(v) * 100)}%`}
                labelStyle={{ color: "#ffb947" }}
              />
              <Legend
                verticalAlign="top"
                height={16}
                iconType="plainline"
                wrapperStyle={{
                  fontSize: 9,
                  fontFamily: "ui-monospace, monospace",
                  letterSpacing: "0.1em",
                  color: "#7fa990",
                  paddingBottom: 4,
                }}
              />
        {series.map((s) => (
          <Line
            key={s.label}
            type="monotone"
            dataKey={s.label}
            stroke={s.color}
            strokeWidth={1.4}
            dot={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
    );

  if (headless) {
    return <div className="h-full w-full p-1">{body}</div>;
  }

  return (
    <div className="ascii-panel flex flex-1 min-h-[180px] flex-col overflow-hidden">
      <div className="ascii-panel-heading flex items-center gap-3 px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] leading-none">
        <span className="phosphor">odds · 24h</span>
        <span className="text-ink-dim">top {tracked.length} outcomes</span>
        <span className="ml-auto text-ink-dim">
          {market.kind === "high" ? "highest" : "lowest"} temp
        </span>
      </div>
      <div className="flex-1 min-h-[160px] p-1">{body}</div>
    </div>
  );
}
