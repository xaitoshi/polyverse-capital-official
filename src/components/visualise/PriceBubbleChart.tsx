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
import { formatCents, formatSgt, formatSgtShort, formatUsd, shortAddr } from "../../lib/pm-explorer/format";
import {
  type ChartTradeDatum,
  tradePointToChartDatum,
} from "../../lib/pm-explorer/tradeSelection";
import type { SignificantMove } from "../../lib/pm-explorer/significantMoves";

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
  /** Default false: mute ordinary bubbles; significant moves carry context. */
  showAllTrades: boolean;
  selectedTradeId: string | null;
  selectedMoveId: string | null;
  moves: SignificantMove[];
  isolateWallet: boolean;
  onTradeClick: (datum: ChartTradeDatum, allVisible: ChartTradeDatum[]) => void;
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
  showAllTrades,
  selectedTradeId,
  selectedMoveId,
  moves,
  isolateWallet,
  onTradeClick,
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

  const allVisibleDatums = useMemo(() => {
    const playhead = playheadTs ? Date.parse(playheadTs) : null;
    const out: ChartTradeDatum[] = [];
    for (const o of visibleOutcomes) {
      for (const tr of trades) {
        if (tr.tokenId !== o.tokenId) continue;
        if (sideFilter !== "ALL" && tr.side !== sideFilter) continue;
        if (tr.notionalUsdc < minNotional) continue;
        const watched = watchAddrs.has(tr.wallet.toLowerCase());
        if (watchedOnly && !watched) continue;
        if (focusedWallet && tr.wallet.toLowerCase() !== focusedWallet.toLowerCase()) continue;
        if (isolateWallet && focusedWallet && tr.wallet.toLowerCase() !== focusedWallet.toLowerCase()) {
          continue;
        }
        if (playhead != null && Date.parse(tr.ts) > playhead) continue;
        out.push(tradePointToChartDatum(tr, o.label, watched, watch.length > 0));
      }
    }
    return out;
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
    isolateWallet,
  ]);

  /** Highlight set: selected trade, move-associated trades, or all when showAllTrades. */
  const highlightIds = useMemo(() => {
    const s = new Set<string>();
    if (selectedTradeId) s.add(selectedTradeId);
    const move = moves.find((m) => m.id === selectedMoveId);
    if (move) for (const a of move.associatedTrades) s.add(a.trade.id);
    return s;
  }, [selectedTradeId, selectedMoveId, moves]);

  const scatterByOutcome = useMemo(() => {
    return visibleOutcomes.map((o, i) => {
      let points = allVisibleDatums.filter((d) => d.tokenId === o.tokenId);
      if (!showAllTrades) {
        // Mute: keep large notionals + anything highlighted; others dropped from scatter
        points = points.filter((d) => highlightIds.has(d.tradeId) || d.notional >= 250);
      }
      points = points.map((d) => {
        const selected = d.tradeId === selectedTradeId;
        const inMove = highlightIds.has(d.tradeId);
        return {
          ...d,
          opacity: selected ? 1 : inMove ? 0.95 : showAllTrades ? d.opacity : 0.25,
          color: selected ? "#ffb947" : d.color,
        };
      });
      return { outcome: o, color: LINE_COLORS[i % LINE_COLORS.length], points };
    });
  }, [visibleOutcomes, allVisibleDatums, showAllTrades, highlightIds, selectedTradeId]);

  const playheadMs = playheadTs ? Date.parse(playheadTs) : null;
  const activeMove = moves.find((m) => m.id === selectedMoveId) || null;

  if (!lineData.length && scatterByOutcome.every((s) => !s.points.length)) {
    return (
      <div className="flex h-full min-h-[320px] items-center justify-center text-[12px] text-ink-dim">
        No price or trade points loaded for the selected outcomes.
      </div>
    );
  }

  const chartHeight = 420;

  return (
    <div className="w-full" style={{ width: "100%", height: chartHeight, minHeight: chartHeight }}>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <ComposedChart data={lineData} margin={{ top: 12, right: 16, bottom: 8, left: 0 }}>
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
            label={{ value: "¢", position: "insideTopLeft", fill: "#7fa990", fontSize: 10 }}
          />
          <ZAxis dataKey="z" range={[20, 400]} />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0]?.payload as Record<string, unknown>;
              if (!p) return null;
              if (p.side) {
                return (
                  <div className="ascii-panel rounded-sm px-3 py-2 text-[10px] max-w-xs">
                    <div className="phosphor">{String(p.outcome)}</div>
                    <div className="text-ink-dim">{formatSgt(Number(p.t))}</div>
                    <div className={p.side === "BUY" ? "text-cyan" : "text-magenta"}>
                      {p.side === "BUY" ? "▲" : "▼"} {String(p.side)} · {formatCents(Number(p.price))}
                    </div>
                    <div>Notional {formatUsd(Number(p.notional))}</div>
                    <div>
                      {String(p.name || shortAddr(String(p.wallet)))}
                      {p.watched ? " · watched" : ""}
                    </div>
                    <div className="mt-1 text-amber">Click / tap to inspect (hover ≠ select)</div>
                  </div>
                );
              }
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
          {activeMove && (
            <>
              <ReferenceLine
                x={activeMove.startMs}
                stroke="#ffb947"
                strokeDasharray="2 2"
                label={{ value: "move↓", fill: "#ffb947", fontSize: 9 }}
              />
              <ReferenceLine x={activeMove.endMs} stroke="#ffb947" strokeDasharray="2 2" />
            </>
          )}
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
              isAnimationActive={false}
              onClick={(data) => {
                // Recharts passes the datum payload on click
                const raw = (data as { payload?: ChartTradeDatum } | ChartTradeDatum) || null;
                const datum =
                  raw && "payload" in (raw as object) && (raw as { payload?: ChartTradeDatum }).payload
                    ? (raw as { payload: ChartTradeDatum }).payload
                    : (raw as ChartTradeDatum | null);
                if (!datum || !datum.tradeId) return;
                onTradeClick(datum, allVisibleDatums);
              }}
              shape={(props: {
                cx?: number;
                cy?: number;
                payload?: ChartTradeDatum;
              }) => {
                const cx = props.cx ?? 0;
                const cy = props.cy ?? 0;
                const payload = props.payload;
                const r = Math.max(4, (payload?.z ?? 6) / 2.2);
                const color = payload?.color || "#5ef1ff";
                const opacity = payload?.opacity ?? 0.8;
                const side = payload?.side;
                const selected = payload?.tradeId === selectedTradeId;
                const hit = (
                  <g
                    style={{ cursor: "pointer" }}
                    role="button"
                    tabIndex={-1}
                    aria-label={
                      payload
                        ? `${payload.side} ${payload.outcome} ${formatUsd(payload.notional)}`
                        : "trade"
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      if (payload) onTradeClick(payload, allVisibleDatums);
                    }}
                    onKeyDown={(e) => {
                      if ((e.key === "Enter" || e.key === " ") && payload) {
                        e.preventDefault();
                        onTradeClick(payload, allVisibleDatums);
                      }
                    }}
                  >
                    {side === "SELL" ? (
                      <polygon
                        points={`${cx},${cy - r * 1.2} ${cx + r * 1.2},${cy} ${cx},${cy + r * 1.2} ${cx - r * 1.2},${cy}`}
                        fill={color}
                        fillOpacity={opacity}
                        stroke={selected ? "#ffb947" : color}
                        strokeWidth={selected ? 2 : 1}
                        strokeOpacity={1}
                      />
                    ) : (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={r}
                        fill={color}
                        fillOpacity={opacity}
                        stroke={selected ? "#ffb947" : color}
                        strokeWidth={selected ? 2 : 1}
                        strokeOpacity={1}
                      />
                    )}
                    {/* Invisible larger hit target for mobile tap */}
                    <circle cx={cx} cy={cy} r={Math.max(r + 6, 12)} fill="transparent" />
                  </g>
                );
                return hit;
              }}
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
