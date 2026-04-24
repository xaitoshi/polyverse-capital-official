"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { TempMarket, Outcome } from "@/lib/polymarket";
import type { ModelForecast } from "@/lib/forecasts";
import type { HistoryDay } from "@/lib/metar";
import WindyMap from "./WindyMap";
import HistoryChart from "./HistoryChart";
import PriceSparkline from "./PriceSparkline";
import MarketPriceHistory from "./MarketPriceHistory";
import { useWatchlist } from "@/lib/useWatchlist";

type Props = {
  cityMarkets: TempMarket[];
  onClose: () => void;
};

type DateGroup = {
  date: string;
  high: TempMarket | null;
  low: TempMarket | null;
  closed: boolean;
};

type ForecastModelKey = "ecmwf_ifs025" | "gfs_seamless";

const MODEL_CHOICES: { key: ForecastModelKey; short: string }[] = [
  { key: "ecmwf_ifs025", short: "ECMWF" },
  { key: "gfs_seamless", short: "GFS" },
];

// --- helpers ----------------------------------------------------------------

function groupByDate(markets: TempMarket[]): DateGroup[] {
  const map = new Map<string, DateGroup>();
  for (const m of markets) {
    const g = map.get(m.date) ?? {
      date: m.date,
      high: null,
      low: null,
      closed: true,
    };
    if (m.kind === "high") g.high = m;
    else g.low = m;
    if (!m.closed) g.closed = false;
    map.set(m.date, g);
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function historyWindow(date: string) {
  const d = new Date(date + "T00:00:00Z");
  const start = new Date(d);
  start.setUTCDate(start.getUTCDate() - 14);
  const end = new Date(d);
  end.setUTCDate(end.getUTCDate() + 2);
  const today = new Date();
  if (end > today) end.setTime(today.getTime());
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function fmtDate(d: string) {
  const [, m, day] = d.split("-");
  const month = [
    "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
    "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
  ][Number(m) - 1];
  return `${month} ${Number(day)}`;
}

function cToF(c: number) {
  return (c * 9) / 5 + 32;
}

function formatCountdown(iso?: string): string {
  if (!iso) return "—";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "resolving";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// Outcome label parser. Accepts forms like "17°C", "8°C or below",
// "30°C+", "23°C and above". Returns the open/closed bounds of the
// temperature bucket in °C. null on either bound means "unbounded".
function parseBucket(
  label: string
): { min: number | null; max: number | null } | null {
  const num = label.match(/(-?\d+)/);
  if (!num) return null;
  const v = Number(num[1]);
  const below = /or below|and below|or less|or lower/i.test(label);
  const above = /\+|or above|and above|or more|or higher/i.test(label);
  if (below) return { min: null, max: v };
  if (above) return { min: v, max: null };
  return { min: v, max: v };
}

// An outcome is "eliminated" when the already-observed value at the
// resolution station makes it physically impossible to win:
//  - HIGH market: the final daily high is >= the current max-so-far,
//    so any bucket whose upper bound is below `observed` is dead.
//  - LOW market: the final daily low is <= the current min-so-far,
//    so any bucket whose lower bound is above `observed` is dead.
export function isOutcomeEliminated(
  label: string,
  kind: "high" | "low",
  observed: number | null | undefined
): boolean {
  if (observed == null) return false;
  const b = parseBucket(label);
  if (!b) return false;
  if (kind === "high") {
    return b.max !== null && b.max < observed;
  }
  return b.min !== null && b.min > observed;
}

// Probability-weighted implied temperature. `observed` filters out already
// eliminated buckets before computing the weighted mean so the market's
// implied temp actually reflects what the market could still resolve to.
function impliedTemp(
  outcomes: Outcome[],
  kind: "high" | "low",
  observed: number | null | undefined
): number | null {
  let num = 0;
  let den = 0;
  for (const o of outcomes) {
    if (isOutcomeEliminated(o.label, kind, observed)) continue;
    const match = o.label.match(/(-?\d+)/);
    if (!match) continue;
    const v = Number(match[1]);
    num += v * o.probability;
    den += o.probability;
  }
  return den > 0 ? num / den : null;
}

function modelConsensus(
  models: Map<string, ModelForecast>,
  date: string | null,
  kind: "high" | "low"
) {
  if (!date) return null;
  const e = models.get("ecmwf_ifs025")?.points.find((p) => p.date === date);
  const g = models.get("gfs_seamless")?.points.find((p) => p.date === date);
  const ev = kind === "high" ? e?.highC : e?.lowC;
  const gv = kind === "high" ? g?.highC : g?.lowC;
  const vals = [ev, gv].filter((x): x is number => x != null);
  if (!vals.length) return null;
  return {
    ecmwf: ev ?? null,
    gfs: gv ?? null,
    mean: vals.reduce((a, b) => a + b, 0) / vals.length,
    spread: vals.length > 1 ? Math.max(...vals) - Math.min(...vals) : 0,
  };
}

function ProbBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="prob-bar flex-1">
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

// --- main component ---------------------------------------------------------

export default function CityPanel({ cityMarkets, onClose }: Props) {
  const groups = useMemo(() => groupByDate(cityMarkets), [cityMarkets]);
  const city = cityMarkets[0]?.city;
  const cityKey = cityMarkets[0]?.cityKey;
  const station = cityMarkets[0]?.station;

  const initialDate = useMemo(() => {
    const open = groups.find((g) => !g.closed);
    return (open ?? groups[0])?.date ?? null;
  }, [groups]);

  const [activeDate, setActiveDate] = useState<string | null>(initialDate);
  const [activeModel, setActiveModel] = useState<ForecastModelKey>("ecmwf_ifs025");
  const [forecast, setForecast] = useState<ModelForecast[] | null>(null);
  const [history, setHistory] = useState<HistoryDay[] | null>(null);
  const [fetching, setFetching] = useState(false);
  // `tick` rerenders once a minute so the countdown stays fresh without
  // holding wall-clock time in render (which the new react-hooks/purity rule
  // flags as impure).
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveDate(initialDate);
  }, [initialDate, cityKey]);

  useEffect(() => {
    if (!city) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFetching(true);
    setForecast(null);
    fetch(`/api/forecast?lat=${city.lat}&lon=${city.lon}&cc=${city.countryCode}`)
      .then((r) => r.json())
      .then((d) => !cancelled && setForecast(d.models ?? []))
      .catch(() => !cancelled && setForecast([]))
      .finally(() => !cancelled && setFetching(false));
    return () => {
      cancelled = true;
    };
  }, [cityKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!station || !activeDate) return;
    let cancelled = false;
    const { start, end } = historyWindow(activeDate);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHistory(null);
    fetch(`/api/history?station=${station}&start=${start}&end=${end}`)
      .then((r) => r.json())
      .then((d) => !cancelled && setHistory(d.days ?? []))
      .catch(() => !cancelled && setHistory([]));
    return () => {
      cancelled = true;
    };
  }, [station, activeDate]);

  const activeGroup = groups.find((g) => g.date === activeDate) ?? null;
  const activeMarket = activeGroup?.high ?? activeGroup?.low ?? null;
  const activeKind: "high" | "low" = activeGroup?.high ? "high" : "low";

  const modelsByKey = useMemo(() => {
    const m = new Map<string, ModelForecast>();
    (forecast ?? []).forEach((f) => m.set(f.model, f));
    return m;
  }, [forecast]);

  const consensus = useMemo(
    () => modelConsensus(modelsByKey, activeDate, activeKind),
    [modelsByKey, activeDate, activeKind]
  );

  // Already-observed high/low for the active date, pulled from the METAR
  // window. If METAR has a partial-day reading for today it becomes a
  // floor (for highs) or ceiling (for lows) that the final value can only
  // move past. Any outcome bucket outside that half-line is impossible.
  const observed = useMemo(() => {
    if (!activeDate || !history) return null;
    const hit = history.find((d) => d.date === activeDate);
    if (!hit) return null;
    return activeKind === "high" ? hit.highC : hit.lowC;
  }, [history, activeDate, activeKind]);

  const marketImplied = activeMarket
    ? impliedTemp(activeMarket.outcomes, activeKind, observed)
    : null;
  // Top outcome for the snapshot ignores buckets that can no longer win —
  // otherwise we show "market top = 31°C" for a high market that's
  // already reached 33°C.
  const marketTop = useMemo(() => {
    if (!activeMarket) return null;
    const alive = activeMarket.outcomes.filter(
      (o) => !isOutcomeEliminated(o.label, activeKind, observed)
    );
    return alive[0] ?? null;
  }, [activeMarket, activeKind, observed]);
  const countdown = formatCountdown(activeMarket?.endDate);
  const { toggle: toggleWatch, has: isWatched } = useWatchlist();

  if (!city) return null;

  return (
    <AnimatePresence mode="wait">
      <motion.aside
        key={cityKey}
        initial={{ x: 40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 40, opacity: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="ascii-panel crt-scanlines crt-flicker slim-scroll relative flex h-full w-full flex-col overflow-hidden"
      >
        {/* Single-row aligned header: every element is items-center + same
            font metrics so the baseline is consistent across the strip. */}
        <div className="ascii-panel-heading sticky top-0 z-10 flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-[10px] uppercase tracking-[0.22em] leading-none">
          <span className="phosphor inline-flex items-center gap-2">
            <span>◉</span>
            <span className="text-[12px] tracking-[0.2em]">{city.name}</span>
          </span>
          <span className="phosphor-amber">{city.country}</span>
          <span className="text-ink-dim">
            STN <span className="phosphor">{station || "—"}</span>
          </span>
          <span className="text-ink-dim tabular-nums">
            {city.lat.toFixed(2)}°, {city.lon.toFixed(2)}°
          </span>
          {activeMarket && (
            <span className="text-ink-dim">
              RESOLVES <span className="phosphor-amber">{countdown}</span>
            </span>
          )}
          <button
            onClick={() => toggleWatch(cityKey)}
            aria-label={isWatched(cityKey) ? "Unwatch city" : "Watch city"}
            className={
              "ml-auto border px-2 py-1 leading-none transition-colors " +
              (isWatched(cityKey)
                ? "border-amber/70 bg-amber/10 phosphor-amber"
                : "border-panel-border/60 text-ink hover:bg-cyan/[0.15]")
            }
          >
            {isWatched(cityKey) ? "★ WATCHING" : "☆ WATCH"}
          </button>
          <button
            onClick={onClose}
            aria-label="Close panel"
            className="border border-panel-border/60 px-2 py-1 leading-none text-ink hover:bg-cyan/[0.15]"
          >
            ESC ✕
          </button>
        </div>

        {/* Panel body: four logical rows. Each row is a 2-col grid where
            both cells stretch to match (no fixed heights) so there's no
            residual blank space below either cell. */}
        <div className="slim-scroll flex flex-1 flex-col gap-3 overflow-y-auto p-3">
          {/* Row 1 — Dates │ Snapshot. Content-sized; both cells stretch
              to the taller of the two via grid's default `items-stretch`,
              and because the dates list is typically the taller side we
              get a row that's "sized according to the dates widget". */}
          <div className="grid gap-3 lg:grid-cols-2">
            <DateList
              groups={groups}
              activeDate={activeDate}
              onPick={setActiveDate}
            />
            <SnapshotStrip
              consensus={consensus}
              marketTop={marketTop}
              marketImplied={marketImplied}
              activeKind={activeKind}
              activeDate={activeDate}
              countdown={countdown}
              observed={observed ?? null}
            />
          </div>

          {/* Row 2 — Market outcome bars │ 24h odds chart. Both cells
              stretch to match the taller one (usually the stacked HIGH+
              LOW market blocks). */}
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="flex flex-col gap-3">
              {activeGroup?.high && (
                <MarketBlock
                  market={activeGroup.high}
                  observed={activeKind === "high" ? observed : null}
                />
              )}
              {activeGroup?.low && (
                <MarketBlock
                  market={activeGroup.low}
                  observed={activeKind === "low" ? observed : null}
                />
              )}
              {!activeGroup && (
                <div className="ascii-panel p-3 text-xs text-ink-dim">
                  Select a date to see outcomes.
                </div>
              )}
            </div>
            <div className="ascii-panel flex flex-col overflow-hidden">
              <div className="ascii-panel-heading flex items-center gap-3 px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] leading-none">
                <span className="phosphor">odds · last 24h</span>
                <span className="text-ink-dim">top outcomes, CLOB</span>
                <span className="ml-auto text-ink-dim">
                  {activeMarket
                    ? `${activeKind} · ${fmtDate(activeMarket.date)}`
                    : "—"}
                </span>
              </div>
              <div className="min-h-[220px] flex-1">
                <MarketPriceHistory
                  market={activeGroup?.high ?? activeGroup?.low ?? null}
                  headless
                />
              </div>
            </div>
          </div>

          {/* Row 3 — Forecast │ Windy (same size, side-by-side) */}
          <div className="grid h-[280px] gap-3 lg:grid-cols-2">
            <ForecastCard
              models={modelsByKey}
              active={activeModel}
              setActive={setActiveModel}
              highlightDate={activeDate}
              marketKind={activeKind}
              loading={fetching}
              onPickDate={setActiveDate}
            />
            <div className="ascii-panel flex flex-col overflow-hidden">
              <div className="ascii-panel-heading flex items-center gap-3 px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] leading-none">
                <span className="phosphor">live map · windy</span>
                <span className="ml-auto text-ink-dim">
                  temp · ecmwf surface
                </span>
              </div>
              <div className="flex-1 min-h-0">
                <WindyMap lat={city.lat} lon={city.lon} embedded />
              </div>
            </div>
          </div>

          {/* Bottom — full-width recorded temperature history */}
          <div className="ascii-panel flex flex-col overflow-hidden">
            <div className="ascii-panel-heading flex items-center gap-3 px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] leading-none">
              <span className="phosphor">recorded · {station || "—"}</span>
              {activeMarket && (
                <span className="text-ink-dim truncate">
                  source ·{" "}
                  <span className="phosphor">
                    {activeMarket.title.replace(/\?$/, "")}
                  </span>
                </span>
              )}
            </div>
            <div className="h-[220px] p-2">
              <HistoryChart
                days={history ?? []}
                highlightDate={activeDate || undefined}
                marketKind={activeKind}
              />
            </div>
          </div>
        </div>
      </motion.aside>
    </AnimatePresence>
  );
}

// --- subviews ---------------------------------------------------------------

function DateList({
  groups,
  activeDate,
  onPick,
}: {
  groups: DateGroup[];
  activeDate: string | null;
  onPick: (d: string) => void;
}) {
  if (!groups.length)
    return (
      <div className="ascii-panel p-3 text-xs text-ink-dim">
        No market dates for this city.
      </div>
    );
  return (
    <div className="ascii-panel flex h-full flex-col overflow-hidden">
      <div className="ascii-panel-heading flex items-center gap-3 px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] leading-none">
        <span className="phosphor">dates · {groups.length}</span>
        <span className="text-ink-dim">click to drill</span>
      </div>
      <ul className="slim-scroll max-h-[320px] flex-1 overflow-y-auto">
        {groups.map((g) => {
          const isActive = g.date === activeDate;
          return (
            <li key={g.date}>
              <button
                onClick={() => onPick(g.date)}
                className={
                  "flex w-full items-center gap-3 px-3 py-1.5 text-left text-[11px] leading-none transition-colors " +
                  (isActive
                    ? "bg-cyan/[0.12] phosphor"
                    : "hover:bg-cyan/[0.06] text-ink")
                }
              >
                <span
                  className={
                    "inline-block w-14 tabular-nums " +
                    (isActive ? "phosphor-amber" : "text-ink-dim")
                  }
                >
                  {fmtDate(g.date)}
                </span>
                <span className="flex gap-1">
                  {g.high && (
                    <Pill
                      text="HIGH"
                      active={!g.high.closed}
                      color="amber"
                    />
                  )}
                  {g.low && (
                    <Pill
                      text="LOW"
                      active={!g.low.closed}
                      color="cyan"
                    />
                  )}
                </span>
                <span className="ml-auto text-[10px] uppercase tracking-[0.22em] text-ink-dim">
                  {g.closed ? "resolved" : "open"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Pill({
  text,
  active,
  color,
}: {
  text: string;
  active: boolean;
  color: "amber" | "cyan";
}) {
  const border =
    !active
      ? "border-ink-dim/40 text-ink-dim"
      : color === "amber"
      ? "border-amber/60 text-amber"
      : "border-cyan/60 text-cyan";
  return (
    <span
      className={
        "border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.2em] leading-none " +
        border
      }
    >
      {text}
    </span>
  );
}

function MarketBlock({
  market,
  observed,
}: {
  market: TempMarket;
  observed: number | null;
}) {
  const top = market.outcomes.slice(0, 8);
  const accent = market.kind === "high" ? "phosphor-amber" : "phosphor";
  const deadCount = market.outcomes.filter((o) =>
    isOutcomeEliminated(o.label, market.kind, observed)
  ).length;
  return (
    <div className="ascii-panel">
      <div className="ascii-panel-heading flex items-center gap-3 px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] leading-none">
        <span className={accent}>
          {market.kind === "high" ? "HIGH" : "LOW"} · {fmtDate(market.date)}
        </span>
        <span className="text-ink-dim tabular-nums">
          vol $
          {market.volume.toLocaleString(undefined, {
            maximumFractionDigits: 0,
          })}
        </span>
        {observed != null && (
          <span className="text-ink-dim">
            obs{" "}
            <span className="phosphor">
              {Math.round(observed)}°C
            </span>
          </span>
        )}
        <span
          className={
            "ml-auto " +
            (market.closed ? "text-ink-dim" : "phosphor-amber")
          }
        >
          {market.closed ? "RESOLVED" : "OPEN"}
        </span>
      </div>
      <ul className="p-2">
        {top.map((o) => {
          const dead = isOutcomeEliminated(o.label, market.kind, observed);
          return (
            <li
              key={o.id}
              className={
                "flex items-center gap-3 px-1 py-1 text-[11px] leading-none " +
                (dead ? "opacity-40" : "")
              }
              title={dead ? "Eliminated: outside current recorded range" : undefined}
            >
              <span
                className={
                  "w-20 shrink-0 " +
                  (dead ? "text-ink-dim line-through" : "text-ink")
                }
              >
                {o.label}
              </span>
              <ProbBar value={dead ? 0 : o.probability} />
              <span
                className={
                  "w-10 text-right tabular-nums " +
                  (dead ? "text-ink-dim" : "text-amber")
                }
              >
                {dead ? "—" : `${Math.round(o.probability * 100)}%`}
              </span>
              {!dead && o.probability >= 0.03 && o.yesTokenId ? (
                <PriceSparkline
                  tokenId={o.yesTokenId}
                  interval="1d"
                  width={72}
                  height={18}
                  stroke={market.kind === "high" ? "#ffb947" : "#5ef1ff"}
                />
              ) : (
                <span className="w-[72px]" />
              )}
            </li>
          );
        })}
      </ul>
      {deadCount > 0 && (
        <div className="border-t border-panel-border/40 px-3 py-1 text-[10px] uppercase tracking-[0.22em] leading-none text-ink-dim">
          {deadCount} bucket{deadCount === 1 ? "" : "s"} eliminated by
          observed {Math.round(observed!)}°C
        </div>
      )}
      <a
        href={`https://polymarket.com/event/${market.slug}`}
        target="_blank"
        rel="noreferrer"
        className="block border-t border-panel-border/40 px-3 py-1 text-right text-[10px] uppercase tracking-[0.22em] leading-none phosphor-amber hover:underline"
      >
        open on polymarket ↗
      </a>
    </div>
  );
}

function SnapshotStrip({
  consensus,
  marketTop,
  marketImplied,
  activeKind,
  activeDate,
  countdown,
  observed,
}: {
  consensus: ReturnType<typeof modelConsensus>;
  marketTop: Outcome | null;
  marketImplied: number | null;
  activeKind: "high" | "low";
  activeDate: string | null;
  countdown: string;
  observed: number | null;
}) {
  // For a HIGH market, final value >= observed; the consensus only sets a
  // ceiling above that floor. Clamp so the edge compares against physically
  // plausible values.
  const clampedMean =
    consensus && observed != null
      ? activeKind === "high"
        ? Math.max(consensus.mean, observed)
        : Math.min(consensus.mean, observed)
      : consensus?.mean ?? null;

  const divergence =
    clampedMean !== null && marketImplied != null
      ? marketImplied - clampedMean
      : null;

  return (
    <div className="ascii-panel flex h-full flex-col overflow-hidden">
      <div className="ascii-panel-heading flex items-center gap-3 px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] leading-none">
        <span className="phosphor">
          snapshot · {activeDate ? fmtDate(activeDate) : "—"} ·{" "}
          {activeKind === "high" ? "highest" : "lowest"}
        </span>
        <span className="ml-auto text-ink-dim">
          resolves <span className="phosphor-amber">{countdown}</span>
        </span>
      </div>
      <div className="grid flex-1 grid-cols-3 gap-px bg-panel-border/30">
        <Stat
          label={
            clampedMean !== null && consensus && clampedMean !== consensus.mean
              ? "Model μ (clamped)"
              : "Model μ"
          }
          primary={
            clampedMean !== null ? `${Math.round(clampedMean)}°C` : "—"
          }
          secondary={
            consensus
              ? `${Math.round(cToF(clampedMean ?? consensus.mean))}°F · ±${consensus.spread.toFixed(1)}`
              : ""
          }
          tone="phosphor"
        />
        <Stat
          label="ECMWF / GFS"
          primary={
            consensus && (consensus.ecmwf != null || consensus.gfs != null)
              ? `${fmtDeg(consensus.ecmwf)} / ${fmtDeg(consensus.gfs)}`
              : "—"
          }
          secondary="°C · per-model"
          tone="ink"
        />
        <Stat
          label="Market top"
          primary={
            marketTop
              ? `${marketTop.label} · ${Math.round(
                  marketTop.probability * 100
                )}%`
              : "—"
          }
          secondary={
            marketImplied != null
              ? `μ ${Math.round(marketImplied)}°C`
              : ""
          }
          tone="amber"
        />
      </div>
      {divergence !== null && (
        <div className="flex items-center gap-3 border-t border-panel-border/30 px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] leading-none">
          <span className="text-ink-dim">edge</span>
          <span
            className={
              Math.abs(divergence) > 1 ? "phosphor-amber" : "text-ink-dim"
            }
          >
            market {divergence >= 0 ? "+" : ""}
            {divergence.toFixed(1)}°C vs models
          </span>
          <span className="ml-auto text-ink-dim">
            {Math.abs(divergence) > 2
              ? "⚠ large divergence"
              : Math.abs(divergence) > 1
              ? "· watch"
              : "· tight"}
          </span>
        </div>
      )}
    </div>
  );
}

function fmtDeg(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${Math.round(v)}`;
}

function Stat({
  label,
  primary,
  secondary,
  tone,
}: {
  label: string;
  primary: string;
  secondary: string;
  tone: "phosphor" | "amber" | "ink";
}) {
  const cls =
    tone === "phosphor"
      ? "phosphor"
      : tone === "amber"
      ? "phosphor-amber"
      : "text-ink";
  return (
    <div className="flex h-full flex-col justify-center bg-panel px-3 py-2 leading-tight">
      <div className="text-[9px] uppercase tracking-[0.3em] text-ink-dim">
        {label}
      </div>
      <div className={`text-[15px] tabular-nums ${cls}`}>{primary}</div>
      {secondary && (
        <div className="text-[9px] uppercase tracking-[0.25em] text-ink-dim">
          {secondary}
        </div>
      )}
    </div>
  );
}

function ForecastCard({
  models,
  active,
  setActive,
  highlightDate,
  marketKind,
  loading,
  onPickDate,
}: {
  models: Map<string, ModelForecast>;
  active: ForecastModelKey;
  setActive: (k: ForecastModelKey) => void;
  highlightDate: string | null;
  marketKind: "high" | "low";
  loading: boolean;
  onPickDate?: (d: string) => void;
}) {
  const activeModel = models.get(active);
  const points = activeModel?.points ?? [];

  return (
    <div className="ascii-panel flex h-full flex-col overflow-hidden">
      <div className="ascii-panel-heading flex items-center gap-3 px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] leading-none">
        <span className="phosphor">forecast · 10d</span>
        <span className="text-ink-dim">
          target = {marketKind === "high" ? "daily HIGH" : "daily LOW"}
        </span>
        <div className="ml-auto flex gap-1">
          {MODEL_CHOICES.map((m) => (
            <button
              key={m.key}
              onClick={() => setActive(m.key)}
              className={
                "border px-2 py-1 text-[10px] tracking-[0.2em] leading-none transition-colors " +
                (active === m.key
                  ? "border-amber bg-amber/10 phosphor-amber"
                  : "border-panel-border/60 text-ink-dim hover:text-ink")
              }
            >
              {m.short}
            </button>
          ))}
        </div>
      </div>
      {loading && !models.size ? (
        <div className="p-4 text-xs text-ink-dim">fetching models…</div>
      ) : !activeModel ? (
        <div className="p-4 text-xs text-ink-dim">
          {active === "ecmwf_ifs025" ? "ECMWF" : "GFS"} unavailable for this
          location.
        </div>
      ) : (
        <div className="slim-scroll min-h-0 flex-1 overflow-y-auto">
        <table className="w-full border-collapse text-[11px] leading-none">
          <thead>
            <tr className="text-left uppercase tracking-[0.22em] text-ink-dim">
              <th className="px-3 py-1.5 font-normal">Date</th>
              <th className="px-3 py-1.5 font-normal">High</th>
              <th className="px-3 py-1.5 font-normal">Low</th>
              <th className="px-3 py-1.5 text-right font-normal">Target</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => {
              const isTarget = p.date === highlightDate;
              const target = marketKind === "low" ? p.lowC : p.highC;
              return (
                <tr
                  key={p.date}
                  onClick={() => onPickDate?.(p.date)}
                  className={
                    "cursor-pointer border-t border-panel-border/30 transition-colors hover:bg-cyan/[0.08] " +
                    (isTarget ? "bg-cyan/[0.12]" : "")
                  }
                >
                  <td
                    className={
                      "px-3 py-1.5 tabular-nums " +
                      (isTarget ? "phosphor-amber" : "text-ink-dim")
                    }
                  >
                    {fmtDate(p.date)}
                  </td>
                  <td className="px-3 py-1.5 tabular-nums">
                    <span className="phosphor-amber">
                      {p.highC != null ? `${Math.round(p.highC)}°C` : "—"}
                    </span>
                    <span className="ml-2 text-ink-dim">
                      {p.highC != null
                        ? `${Math.round(cToF(p.highC))}°F`
                        : ""}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 tabular-nums">
                    <span className="phosphor">
                      {p.lowC != null ? `${Math.round(p.lowC)}°C` : "—"}
                    </span>
                    <span className="ml-2 text-ink-dim">
                      {p.lowC != null ? `${Math.round(cToF(p.lowC))}°F` : ""}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {target != null ? (
                      <span
                        className={
                          isTarget ? "phosphor-amber" : "text-ink-dim"
                        }
                      >
                        {Math.round(target)}°C
                      </span>
                    ) : (
                      <span className="text-ink-dim">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}
