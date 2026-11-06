import { useMemo } from "react";
import {
  ComposedChart,
  Line,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Brush,
  Legend,
  ReferenceLine,
} from "recharts";
import type { OutcomeRef, PricePoint, TradePoint, WatchWallet } from "../../lib/pm-explorer/types";
import { bubbleRadius, formatCents, formatSgt, formatSgtShort, formatUsd, shortAddr } from "../../lib/pm-explorer/format";

const LINE_COLORS = ["#5ef1ff", "#ffb947", "#ff5ecc", "#7dff9b", "#c56eff"];

type Props = {
  outcomes: OutcomeRef[];
  prices: PricePoint[];
  trades: TradePoint[];
  watch: WatchWallet[];
  selectedTokenIds: Set<string>;
  sideFilter: "ALL" | "BUY" | "SELL";
  minNotional: number;
  watchedOnly: boolean;
  focusedWallet: string | null;
  playheadTs: string | null;
  brushRange: [number, number] | null;
  onBrushRange: (range: [number, number] | null) => void;
};

type ChartRow = {
  t: number;
  label: string;
  [key: string]: number | string | undefined;
};

export default function PriceBubbleChart({
  outcomes,
  prices,
  trades,
  watch,
  selectedTokenIds,
  sideFilter,
  minNotional,
  watchedOnly,
  focusedWallet,
  playheadTs,
  brushRange,
  onBrushRange,
}: Props) {
  const watchAddrs = useMemo(() => {
    const s = new Set<string>();
    for (const w of watch) for (const a of w.addresses) s.add(a.toLowerCase());
    return s;
  }, [watch]);

  const visibleOutcomes = outcomes.filter((o) => selectedTokenIds.has(o.tokenId));

  const lineData = useMemo(() => {
    const byToken = new Map<string, Map<number, number>>();
    for (const o of visibleOutcomes) byToken.set(o.tokenId, new Map());
    for (const p of prices) {
      if (!selectedTokenIds.has(p.tokenId)) continue;
      const m = byToken.get(p.tokenId);
      if (!m) continue;
      m.set(Date.parse(p.ts), p.price);
    }
    const ts = new Set<number>();
    for (const m of byToken.values()) for (const t of m.keys()) ts.add(t);
    const xs = [...ts].sort((a, b) => a - b);
    return xs.map((t) => {
      const row: ChartRow = { t, label: formatSgtShort(t) };
      visibleOutcomes.forEach((o, i) => {
        const v = byToken.get(o.tokenId)?.get(t);
        if (v != null) row[`line_${i}`] = v;
      });
      return row;
    });
  }, [prices, visibleOutcomes, selectedTokenIds]);

  const scatterByOutcome = useMemo(() => {
    const playhead = playheadTs ? Date.parse(playheadTs) : null;
    return visibleOutcomes.map((o, i) => {
      const points = trades
        .filter((tr) => tr.tokenId === o.tokenId)
        .filter((tr) => (sideFilter === "ALL" ? true : tr.side === sideFilter))
        .filter((tr) => tr.notionalUsdc >= minNotional)
        .filter((tr) => (watchedOnly ? watchAddrs.has(tr.wallet) : true))
        .filter((tr) => (focusedWallet ? tr.wallet === focusedWallet : true))
        .filter((tr) => (playhead == null ? true : Date.parse(tr.ts) <= playhead))
        .map((tr) => {
          const watched = watchAddrs.has(tr.wallet);
          return {
            t: Date.parse(tr.ts),
            price: tr.price,
            z: bubbleRadius(tr.notionalUsdc),
            side: tr.side,
            notional: tr.notionalUsdc,
            wallet: tr.wallet,
            name: tr.walletName,
            watched,
            outcome: o.label,
            tx: tr.txHash,
            color: tr.side === "BUY" ? "#5ef1ff" : "#ff5ecc",
            opacity: watched || !watch.length ? 0.9 : 0.35,
          };
        });
      return { outcome: o, color: LINE_COLORS[i % LINE_COLORS.length], points };
    });
  }, [
    trades,
    visibleOutcomes,
    sideFilter,
    minNotional,
    watchedOnly,
    focusedWallet,
    playheadTs,
    watchAddrs,
    watch.length,
  ]);

  const playheadMs = playheadTs ? Date.parse(playheadTs) : null;

  if (!lineData.length && scatterByOutcome.every((s) => !s.points.length)) {
    return (
      <div className="flex h-full min-h-[320px] items-center justify-center text-[12px] text-ink-dim">
        No price or trade points loaded for the selected outcomes.
      </div>
    );
  }

  return (
    <div className="h-full min-h-[360px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={lineData}
          margin={{ top: 12, right: 16, bottom: 8, left: 0 }}
        >
          <CartesianGrid stroke="rgba(94,241,255,0.12)" strokeDasharray="2 3" />
          <XAxis
            dataKey="t"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(v: number) => formatSgtShort(v)}
            tick={{ fill: "#7fa990", fontSize: 9 }}
            stroke="rgba(94,241,255,0.25)"
            minTickGap={40}
          />
          <YAxis
            domain={[0, 1]}
            tickFormatter={(v: number) => `${Math.round(v * 100)}`}
            tick={{ fill: "#7fa990", fontSize: 9 }}
            stroke="rgba(94,241,255,0.25)"
            width={32}
            label={{
              value: "¢",
              position: "insideTopLeft",
              fill: "#7fa990",
              fontSize: 10,
            }}
          />
          <ZAxis dataKey="z" range={[20, 400]} />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0]?.payload as Record<string, unknown>;
              if (!p) return null;
              // Scatter tooltip
              if (p.side) {
                return (
                  <div className="ascii-panel rounded-sm px-3 py-2 text-[10px] max-w-xs">
                    <div className="phosphor">{String(p.outcome)}</div>
                    <div className="text-ink-dim">{formatSgt(Number(p.t))}</div>
                    <div className={p.side === "BUY" ? "text-cyan" : "text-magenta"}>
                      {p.side === "BUY" ? "▲" : "▼"} {String(p.side)} of this outcome token ·{" "}
                      {formatCents(Number(p.price))}
                    </div>
                    <div>Notional {formatUsd(Number(p.notional))}</div>
                    <div>
                      {String(p.name || shortAddr(String(p.wallet)))}
                      {p.watched ? " · watched" : ""}
                    </div>
                    {p.tx ? (
                      <div className="truncate text-ink-dim/70">{String(p.tx)}</div>
                    ) : null}
                  </div>
                );
              }
              // Line tooltip
              return (
                <div className="ascii-panel rounded-sm px-3 py-2 text-[10px]">
                  <div className="text-ink-dim">{formatSgt(Number(p.t))}</div>
                  {visibleOutcomes.map((o, i) => {
                    const v = p[`line_${i}`];
                    if (v == null) return null;
                    return (
                      <div key={o.tokenId} style={{ color: LINE_COLORS[i % LINE_COLORS.length] }}>
                        {o.label}: {formatCents(Number(v))}
                      </div>
                    );
                  })}
                </div>
              );
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 10, color: "#7fa990" }}
            formatter={(value) => <span className="text-ink-dim">{value}</span>}
          />
          {visibleOutcomes.map((o, i) => (
            <Line
              key={`line-${o.tokenId}`}
              type="monotone"
              dataKey={`line_${i}`}
              name={`${o.label} (last)`}
              stroke={LINE_COLORS[i % LINE_COLORS.length]}
              dot={false}
              strokeWidth={1.6}
              isAnimationActive={false}
              connectNulls
            />
          ))}
          {scatterByOutcome.map((series, i) => (
            <Scatter
              key={`scatter-${series.outcome.tokenId}`}
              name={`${series.outcome.label} trades`}
              data={series.points}
              dataKey="price"
              fill={LINE_COLORS[i % LINE_COLORS.length]}
              shape={(props: {
                cx?: number;
                cy?: number;
                payload?: { z?: number; color?: string; opacity?: number; side?: string };
              }) => {
                const cx = props.cx ?? 0;
                const cy = props.cy ?? 0;
                const r = Math.max(3, (props.payload?.z ?? 6) / 2.2);
                const color = props.payload?.color || "#5ef1ff";
                const opacity = props.payload?.opacity ?? 0.8;
                const side = props.payload?.side;
                if (side === "SELL") {
                  // diamond
                  const d = r * 1.2;
                  return (
                    <polygon
                      points={`${cx},${cy - d} ${cx + d},${cy} ${cx},${cy + d} ${cx - d},${cy}`}
                      fill={color}
                      fillOpacity={opacity}
                      stroke={color}
                      strokeOpacity={Math.min(1, opacity + 0.15)}
                    />
                  );
                }
                return (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill={color}
                    fillOpacity={opacity}
                    stroke={color}
                    strokeOpacity={Math.min(1, opacity + 0.15)}
                  />
                );
              }}
              isAnimationActive={false}
            />
          ))}
          {playheadMs != null && Number.isFinite(playheadMs) && (
            <ReferenceLine x={playheadMs} stroke="#ffb947" strokeDasharray="3 3" />
          )}
          {lineData.length > 2 && (
            <Brush
              dataKey="t"
              height={28}
              stroke="rgba(94,241,255,0.45)"
              fill="rgba(94,241,255,0.06)"
              tickFormatter={(v: number) => formatSgtShort(v)}
              onChange={(range) => {
                if (
                  range &&
                  typeof range === "object" &&
                  "startIndex" in range &&
                  "endIndex" in range &&
                  range.startIndex != null &&
                  range.endIndex != null &&
                  lineData[range.startIndex] &&
                  lineData[range.endIndex]
                ) {
                  onBrushRange([
                    Number(lineData[range.startIndex].t),
                    Number(lineData[range.endIndex].t),
                  ]);
                }
              }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
      {brushRange && (
        <div className="px-2 pb-1 text-[10px] text-ink-dim">
          Brush {formatSgt(brushRange[0])} → {formatSgt(brushRange[1])}
        </div>
      )}
    </div>
  );
}
