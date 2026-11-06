import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Activity, ExternalLink, Link2, RotateCcw, Search, X } from "lucide-react";
import {
  EXPLORER_PRESETS,
  applyPresetWatch,
  classifyInput,
  healthSnapshot,
  loadMarketSeries,
  pickPreferredMarket,
  resolveMarketInput,
  searchMarkets,
  type ExplorerPreset,
} from "../../lib/pm-explorer/client";
import type {
  ChildMarket,
  EventConfig,
  MarketGraphPayload,
  SearchHit,
  TradeFetchMeta,
} from "../../lib/pm-explorer/types";
import { formatCents, formatSgt, formatUsd } from "../../lib/pm-explorer/format";
import PriceBubbleChart from "./PriceBubbleChart";
import WalletTable from "./WalletTable";
import TradeInspectPanel from "./TradeInspectPanel";
import SignificantMovesPanel from "./SignificantMovesPanel";
import type { ClobInterval } from "../../lib/pm-explorer/adapters/clobPricesV1";
import { parseVisualiseSearchParams } from "../../lib/pm-explorer/urlState";
import {
  detectSignificantMoves,
  type MoveWindowKey,
} from "../../lib/pm-explorer/significantMoves";
import {
  clearTradeInspect,
  pickFromCluster,
  selectTradeFromClick,
  tradePointToChartDatum,
  type ChartTradeDatum,
  type TradeInspectState,
} from "../../lib/pm-explorer/tradeSelection";

type Status =
  | { kind: "idle" }
  | { kind: "searching" }
  | { kind: "resolving" }
  | { kind: "loading_series" }
  | { kind: "ready" }
  | { kind: "error"; message: string };

function readQuery() {
  return parseVisualiseSearchParams(window.location.search);
}

function writeQuery(next: Record<string, string | undefined>) {
  const sp = new URLSearchParams(window.location.search);
  for (const [k, v] of Object.entries(next)) {
    if (!v) sp.delete(k);
    else sp.set(k, v);
  }
  const qs = sp.toString();
  const url = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
  window.history.replaceState({}, "", url);
}

export default function VisualisePage() {
  const initial = readQuery();
  const [query, setQuery] = useState(initial.q || initial.event || "");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [showHits, setShowHits] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [event, setEvent] = useState<EventConfig | null>(null);
  const [markets, setMarkets] = useState<ChildMarket[]>([]);
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(initial.market || null);
  const [payload, setPayload] = useState<MarketGraphPayload | null>(null);
  const [interval, setInterval] = useState<ClobInterval>(initial.interval);
  const [sideFilter, setSideFilter] = useState<"ALL" | "BUY" | "SELL">("ALL");
  const [minNotional, setMinNotional] = useState(0);
  const [watchedOnly, setWatchedOnly] = useState(false);
  const [watchEnabled, setWatchEnabled] = useState(initial.wallets === "lol-paper-book");
  const [activePreset, setActivePreset] = useState<ExplorerPreset | null>(
    initial.wallets === "lol-paper-book" ? EXPLORER_PRESETS[0] : null
  );
  const [selectedTokenIds, setSelectedTokenIds] = useState<Set<string>>(new Set());
  const [focusedWallet, setFocusedWallet] = useState<string | null>(null);
  const [brushRange, setBrushRange] = useState<[number, number] | null>(null);
  const [playhead, setPlayhead] = useState<string | null>(null);
  const [replaying, setReplaying] = useState(false);
  const [showAllTrades, setShowAllTrades] = useState(false);
  const [moveWindow, setMoveWindow] = useState<MoveWindowKey>("15m");
  const [selectedMoveId, setSelectedMoveId] = useState<string | null>(null);
  const [inspect, setInspect] = useState<TradeInspectState>(clearTradeInspect());
  const [tradeFetchLive, setTradeFetchLive] = useState<TradeFetchMeta | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const skipReloadRef = useRef(false);
  const searchTimer = useRef<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const watch = useMemo(
    () => (watchEnabled ? applyPresetWatch(activePreset || EXPLORER_PRESETS[0]) : []),
    [watchEnabled, activePreset]
  );

  const selectedMarket = useMemo(
    () => markets.find((m) => m.marketId === selectedMarketId) || null,
    [markets, selectedMarketId]
  );

  const cancelInflight = () => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    return abortRef.current.signal;
  };

  const clearAll = useCallback(() => {
    abortRef.current?.abort();
    setQuery("");
    setHits([]);
    setShowHits(false);
    setEvent(null);
    setMarkets([]);
    setSelectedMarketId(null);
    setPayload(null);
    setStatus({ kind: "idle" });
    setFocusedWallet(null);
    setBrushRange(null);
    setPlayhead(null);
    setReplaying(false);
    setSelectedMoveId(null);
    setInspect(clearTradeInspect());
    setTradeFetchLive(null);
    writeQuery({ q: undefined, event: undefined, market: undefined });
  }, []);

  const loadSeries = useCallback(
    async (
      ev: EventConfig,
      market: ChildMarket,
      resolvedFrom: MarketGraphPayload["resolvedFrom"],
      signal: AbortSignal,
      watchList = watch
    ) => {
      setStatus({ kind: "loading_series" });
      setTradeFetchLive({
        status: "loading",
        loadedCount: 0,
        pagesFetched: 0,
        windowStartMs: null,
        windowEndMs: null,
        oldestLoadedMs: null,
        newestLoadedMs: null,
        reachedWindowStart: false,
        exhaustedApi: false,
        hitSafetyCeiling: false,
        note: "Fetching fills for selected interval…",
      });
      try {
        const series = await loadMarketSeries({
          event: ev,
          market,
          resolvedFrom,
          interval,
          watch: watchList,
          signal,
          onTradesProgress: ({ trades, tradeFetch }) => {
            if (signal.aborted) return;
            setTradeFetchLive(tradeFetch);
            setPayload((prev) => {
              if (!prev || prev.market.marketId !== market.marketId) return prev;
              return { ...prev, trades, tradeFetch };
            });
          },
        });
        if (signal.aborted) return;
        setPayload(series);
        setTradeFetchLive(series.tradeFetch || null);
        const tokens = new Set(market.outcomes.slice(0, 4).map((o) => o.tokenId));
        setSelectedTokenIds(tokens);
        setStatus({ kind: "ready" });
        writeQuery({
          event: ev.slug,
          market: market.marketId,
          q: query || undefined,
          interval,
          wallets: watchEnabled ? "lol-paper-book" : undefined,
        });
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setPayload(null);
        setStatus({ kind: "error", message: String((e as Error).message || e) });
      }
    },
    [interval, query, watch, watchEnabled]
  );

  const resolveAndLoad = useCallback(
    async (
      raw: string,
      kind: MarketGraphPayload["resolvedFrom"]["kind"],
      opts?: { preferMarketId?: string; preferKinds?: string[]; preset?: ExplorerPreset | null }
    ) => {
      const signal = cancelInflight();
      setStatus({ kind: "resolving" });
      setShowHits(false);
      try {
        const resolved = await resolveMarketInput({ raw, kind }, signal);
        if (signal.aborted) return;

        if (kind === "keyword" && resolved.searchHits) {
          setHits(resolved.searchHits);
          setShowHits(true);
          setStatus({ kind: "idle" });
          if (!resolved.searchHits.length) {
            setStatus({ kind: "error", message: "No markets matched. Try an event URL." });
          }
          return;
        }

        setEvent(resolved.event);
        setMarkets(resolved.markets);
        const market = pickPreferredMarket(
          resolved.markets,
          opts?.preferKinds,
          opts?.preferMarketId || resolved.selectedMarketId
        );
        if (!market) {
          setStatus({
            kind: "error",
            message: "Event resolved but no markets returned",
          });
          setPayload(null);
          return;
        }
        skipReloadRef.current = true;
        setSelectedMarketId(market.marketId);
        const watchList = opts?.preset
          ? applyPresetWatch(opts.preset)
          : watchEnabled
            ? applyPresetWatch(activePreset || EXPLORER_PRESETS[0])
            : [];
        await loadSeries(
          resolved.event,
          market,
          { raw, kind },
          signal,
          watchList
        );
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setStatus({ kind: "error", message: String((e as Error).message || e) });
      }
    },
    [activePreset, loadSeries, watchEnabled]
  );

  // Debounced keyword search suggestions
  useEffect(() => {
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    const classified = classifyInput(q);
    if (classified.kind !== "keyword") return;

    searchTimer.current = window.setTimeout(async () => {
      const signal = cancelInflight();
      setStatus({ kind: "searching" });
      try {
        const { hits: next } = await searchMarkets(q, signal);
        if (signal.aborted) return;
        setHits(next);
        setShowHits(true);
        setStatus({ kind: "idle" });
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setStatus({ kind: "error", message: String((e as Error).message || e) });
      }
    }, 280);
    return () => {
      if (searchTimer.current) window.clearTimeout(searchTimer.current);
    };
  }, [query]);

  // Deep-link boot
  useEffect(() => {
    const boot = readQuery();
    if (boot.event) {
      resolveAndLoad(boot.event, "slug", { preferMarketId: boot.market || undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload series when interval or market changes after ready.
  // Skip the synthetic run caused by deep-link setSelectedMarketId so we don't
  // abort the in-flight boot loadSeries via cancelInflight().
  useEffect(() => {
    if (!event || !selectedMarket) return;
    if (skipReloadRef.current) {
      skipReloadRef.current = false;
      return;
    }
    if (
      status.kind === "resolving" ||
      status.kind === "searching" ||
      status.kind === "loading_series"
    ) {
      return;
    }
    const signal = cancelInflight();
    loadSeries(event, selectedMarket, { raw: event.slug, kind: "slug" }, signal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interval, selectedMarketId]);

  // Replay playhead
  useEffect(() => {
    if (!replaying || !payload?.trades.length) return;
    const times = payload.trades.map((t) => Date.parse(t.ts)).sort((a, b) => a - b);
    let i = 0;
    setPlayhead(new Date(times[0]).toISOString());
    const id = window.setInterval(() => {
      i += 1;
      if (i >= times.length) {
        setReplaying(false);
        setPlayhead(new Date(times[times.length - 1]).toISOString());
        return;
      }
      setPlayhead(new Date(times[i]).toISOString());
    }, 120);
    return () => window.clearInterval(id);
  }, [replaying, payload]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const raw = query.trim();
    if (!raw) return;
    const classified = classifyInput(raw);
    if (classified.kind === "url") {
      const parsed = classified.parse;
      if (parsed.ok === false) {
        setStatus({ kind: "error", message: parsed.reason });
        return;
      }
      resolveAndLoad(raw, "url");
      return;
    }
    if (classified.kind === "slug") {
      resolveAndLoad(raw, "slug");
      return;
    }
    resolveAndLoad(raw, "keyword");
  };

  const onPickHit = (hit: SearchHit) => {
    setQuery(hit.event.title);
    setShowHits(false);
    resolveAndLoad(hit.event.slug, "slug");
  };

  const onPreset = (preset: ExplorerPreset) => {
    setActivePreset(preset);
    setWatchEnabled(Boolean(preset.watchPresetGroup));
    setQuery(preset.resolveRaw);
    resolveAndLoad(preset.resolveRaw, preset.resolveKind === "url" ? "url" : preset.resolveKind === "keyword" ? "keyword" : "slug", {
      preferKinds: preset.marketKindPrefer,
      preset,
    });
  };

  const bookSum = useMemo(() => {
    if (!payload?.outcomes.length) return null;
    const shown = payload.outcomes.filter((o) => selectedTokenIds.has(o.tokenId));
    if (shown.length < 2) return null;
    const sum = shown.reduce((acc, o) => acc + (o.lastTradePrice ?? 0), 0);
    return sum;
  }, [payload, selectedTokenIds]);

  const health = healthSnapshot();
  const filteredTrades = useMemo(() => {
    if (!payload) return [];
    let list = payload.trades;
    if (brushRange) {
      list = list.filter((t) => {
        const ms = Date.parse(t.ts);
        return ms >= brushRange[0] && ms <= brushRange[1];
      });
    }
    if (playhead) {
      const ph = Date.parse(playhead);
      list = list.filter((t) => Date.parse(t.ts) <= ph);
    }
    if (sideFilter !== "ALL") list = list.filter((t) => t.side === sideFilter);
    if (minNotional > 0) list = list.filter((t) => t.notionalUsdc >= minNotional);
    if (watchedOnly) {
      const addrs = new Set(watch.flatMap((w) => w.addresses.map((a) => a.toLowerCase())));
      list = list.filter((t) => addrs.has(t.wallet));
    }
    if (focusedWallet) list = list.filter((t) => t.wallet === focusedWallet);
    if (selectedTokenIds.size) list = list.filter((t) => selectedTokenIds.has(t.tokenId));
    return list;
  }, [payload, brushRange, playhead, sideFilter, minNotional, watchedOnly, watch, focusedWallet, selectedTokenIds]);


  const primaryOutcome = useMemo(() => {
    if (!payload) return null;
    const selected = payload.outcomes.filter((o) => selectedTokenIds.has(o.tokenId));
    // Prefer a single selected outcome for move detection; else first outcome.
    return selected[0] || payload.outcomes[0] || null;
  }, [payload, selectedTokenIds]);

  const significantMoves = useMemo(() => {
    if (!payload || !primaryOutcome) return [];
    return detectSignificantMoves({
      tokenId: primaryOutcome.tokenId,
      outcomeLabel: primaryOutcome.label,
      prices: payload.prices,
      trades: payload.trades,
      provenance: payload.provenance,
      windowKey: moveWindow,
      maxMoves: 6,
      markers: payload.markers,
      playheadMs: playhead ? Date.parse(playhead) : null,
    });
  }, [payload, primaryOutcome, moveWindow, playhead]);

  // Esc clears inspect; pause replay when inspecting
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setInspect(clearTradeInspect());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (inspect.cluster.length && replaying) setReplaying(false);
  }, [inspect.cluster.length, replaying]);

  // Focus brush when a move is selected
  useEffect(() => {
    if (!selectedMoveId) return;
    const m = significantMoves.find((x) => x.id === selectedMoveId);
    if (m) setBrushRange([m.startMs, m.endMs]);
  }, [selectedMoveId, significantMoves]);

  const handleTradeClick = useCallback((datum: ChartTradeDatum, allVisible: ChartTradeDatum[]) => {
    setReplaying(false);
    setInspect(selectTradeFromClick(allVisible, datum));
    setFocusedWallet(datum.wallet);
  }, []);

  const handleSelectTradeId = useCallback(
    (tradeId: string) => {
      if (!payload || !primaryOutcome) return;
      setReplaying(false);
      const watchAddrs = new Set(watch.flatMap((w) => w.addresses.map((a) => a.toLowerCase())));
      const tr = payload.trades.find((x) => x.id === tradeId);
      if (!tr) return;
      const label =
        payload.outcomes.find((o) => o.tokenId === tr.tokenId)?.label || primaryOutcome.label;
      const datum = tradePointToChartDatum(
        tr,
        label,
        watchAddrs.has(tr.wallet.toLowerCase()),
        watch.length > 0
      );
      const all = payload.trades
        .filter((t) => selectedTokenIds.has(t.tokenId))
        .map((t) => {
          const lab = payload.outcomes.find((o) => o.tokenId === t.tokenId)?.label || t.tokenId;
          return tradePointToChartDatum(t, lab, watchAddrs.has(t.wallet.toLowerCase()), watch.length > 0);
        });
      const next = selectTradeFromClick(all, datum);
      // Force selection even inside a cluster
      setInspect(pickFromCluster({ ...next, cluster: next.cluster.length ? next.cluster : [datum] }, tradeId));
      setFocusedWallet(tr.wallet);
    },
    [payload, primaryOutcome, watch, selectedTokenIds]
  );

  return (
    <div className="min-h-screen w-full bg-[#04070c] font-mono text-ink" ref={wrapRef}>
      <div className="crt-vignette" />
      <main className="relative z-10 mx-auto flex min-h-screen max-w-[1600px] flex-col gap-3 p-3 lg:p-5">
        {/* Header */}
        <header className="ascii-panel ascii-panel-heading flex flex-wrap items-center gap-3 rounded-sm px-4 py-2 text-[11px] uppercase tracking-[0.22em]">
          <span className="phosphor">[ VISUALISE ]</span>
          <span className="text-ink-dim">{"//"}</span>
          <span className="phosphor-amber truncate">Polymarket Interactive Market Explorer</span>
          <span className="ml-auto flex items-center gap-3 text-ink-dim normal-case tracking-normal">
            <a href="/" className="hover:text-blue-400">
              ← polyverse
            </a>
            <span className="phosphor">
              ● LIVE<span className="blink">_</span>
            </span>
          </span>
        </header>

        {/* Search / paste */}
        <section className="ascii-panel relative rounded-sm p-3">
          <form onSubmit={onSubmit} className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <label className="sr-only" htmlFor="pm-explorer-q">
              Search markets or paste a Polymarket link
            </label>
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-blue-400/50" />
              <input
                id="pm-explorer-q"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => hits.length && setShowHits(true)}
                placeholder="Search markets or paste a Polymarket link_"
                className="w-full rounded-sm border border-blue-500/25 bg-transparent py-2.5 pl-9 pr-10 text-[12px] text-ink placeholder:text-ink-dim/40 focus:border-blue-400/50 focus:outline-none"
                autoComplete="off"
                spellCheck={false}
              />
              {query && (
                <button
                  type="button"
                  aria-label="Clear"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-dim hover:text-ink"
                  onClick={clearAll}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              {showHits && hits.length > 0 && (
                <ul
                  className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto ascii-panel rounded-sm"
                  role="listbox"
                >
                  {hits.map((h) => (
                    <li key={h.event.eventId}>
                      <button
                        type="button"
                        className="w-full border-b border-blue-500/10 px-3 py-2.5 text-left last:border-0 hover:bg-blue-500/5"
                        onClick={() => onPickHit(h)}
                      >
                        <div className="text-[12px] text-ink">{h.event.title}</div>
                        <div className="mt-0.5 text-[10px] text-ink-dim">
                          {h.event.slug} · {h.markets?.length ?? 0} markets
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button
              type="submit"
              className="rounded-sm border border-blue-400/40 bg-blue-500/10 px-4 py-2.5 text-[10px] uppercase tracking-[0.2em] text-blue-400 hover:bg-blue-500/20"
            >
              Resolve
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="rounded-sm border border-blue-500/20 px-3 py-2.5 text-[10px] uppercase tracking-[0.2em] text-ink-dim hover:text-ink"
              title="Reset"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </form>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {EXPLORER_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onPreset(p)}
                className="rounded-sm border border-amber/30 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-amber hover:bg-amber/10"
              >
                {p.label}
              </button>
            ))}
            {event && (
              <span className="inline-flex items-center gap-2 rounded-sm border border-blue-400/30 bg-blue-500/10 px-2.5 py-1 text-[10px]">
                <span className="phosphor">Resolved ✓</span>
                <span className="text-ink truncate max-w-[40vw]">
                  {event.title}
                  {selectedMarket ? ` / ${selectedMarket.groupItemTitle || selectedMarket.question}` : ""}
                </span>
                {event.canonicalUrl && (
                  <a
                    href={event.canonicalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400"
                    title="Open on Polymarket"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </span>
            )}
            {(status.kind === "searching" ||
              status.kind === "resolving" ||
              status.kind === "loading_series") && (
              <span className="text-[10px] phosphor">
                {status.kind.replace("_", " ")}…
              </span>
            )}
            {status.kind === "error" && (
              <span className="text-[10px] text-amber">
                {status.message}{" "}
                <button
                  type="button"
                  className="underline"
                  onClick={() => {
                    if (event && selectedMarket) {
                      const signal = cancelInflight();
                      loadSeries(event, selectedMarket, { raw: event.slug, kind: "slug" }, signal);
                    } else if (query.trim()) {
                      const c = classifyInput(query);
                      resolveAndLoad(
                        query.trim(),
                        c.kind === "url" ? "url" : c.kind === "slug" ? "slug" : "keyword"
                      );
                    }
                  }}
                >
                  retry
                </button>
              </span>
            )}
          </div>
        </section>

        {/* Interpretation intro */}
        <section className="ascii-panel rounded-sm px-3 py-2 text-[11px] text-ink-dim">
          <p className="phosphor text-[10px] uppercase tracking-[0.2em]">How to read this</p>
          <p className="mt-1 normal-case tracking-normal">
            Price lines are CLOB history. Bubbles are individual fills for the selected outcome token
            (▲ BUY / ◆ SELL). <span className="text-ink">Click a bubble</span> to inspect wallet, size, and time —
            hover is preview only. Overlapping icons open a disambiguation list. Significant-move cards
            rank |Δpp| windows and list associated fills in that window; association is not proof those
            fills moved the market. Fills paginate newest→oldest for the selected interval (public data-api
            has no server time filter); coverage shows loading/complete/partial. $ filters apply to all
            loaded fills, not a fixed fetch cap. Chart mute is display-only — source fills stay loaded.
            No verified news/catalyst feed is attached.
          </p>
        </section>

        {/* Filters */}
        {markets.length > 0 && (
          <section className="ascii-panel flex flex-col gap-2 rounded-sm p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] uppercase tracking-[0.2em] text-ink-dim">Child market</span>
              <select
                className="max-w-full rounded-sm border border-blue-500/25 bg-[#04070c] px-2 py-1.5 text-[11px] text-ink"
                value={selectedMarketId || ""}
                onChange={(e) => setSelectedMarketId(e.target.value)}
              >
                {markets.map((m) => (
                  <option key={m.marketId} value={m.marketId}>
                    [{m.kind}] {m.groupItemTitle || m.question} · vol {formatUsd(m.volumeNum || 0)}
                  </option>
                ))}
              </select>
              <select
                className="rounded-sm border border-blue-500/25 bg-[#04070c] px-2 py-1.5 text-[11px] text-ink"
                value={interval}
                onChange={(e) => setInterval(e.target.value as ClobInterval)}
              >
                {(["1h", "6h", "1d", "1w", "1m", "max"] as ClobInterval[]).map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] uppercase tracking-[0.2em] text-ink-dim">Outcomes</span>
              {(selectedMarket?.outcomes || []).map((o) => {
                const on = selectedTokenIds.has(o.tokenId);
                return (
                  <button
                    key={o.tokenId}
                    type="button"
                    onClick={() => {
                      setSelectedTokenIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(o.tokenId)) next.delete(o.tokenId);
                        else next.add(o.tokenId);
                        return next;
                      });
                    }}
                    className={`rounded-sm border px-2 py-1 text-[10px] ${
                      on
                        ? "border-blue-400/50 bg-blue-500/10 text-blue-400"
                        : "border-blue-500/15 text-ink-dim"
                    }`}
                  >
                    {o.label} {o.lastTradePrice != null ? formatCents(o.lastTradePrice) : ""}
                  </button>
                );
              })}
              {bookSum != null && (
                <span className="text-[10px] text-ink-dim">
                  book sum {bookSum.toFixed(3)}
                  {Math.abs(bookSum - 1) > 0.03 ? " (spread/stale)" : ""}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {(["ALL", "BUY", "SELL"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSideFilter(s)}
                  className={`rounded-sm border px-2 py-1 text-[10px] uppercase tracking-wider ${
                    sideFilter === s
                      ? "border-blue-400/50 text-blue-400"
                      : "border-blue-500/15 text-ink-dim"
                  }`}
                >
                  {s === "BUY" ? "▲ BUY" : s === "SELL" ? "▼ SELL" : "ALL"}
                </button>
              ))}
              <label className="flex items-center gap-1 text-[10px] text-ink-dim">
                Min $
                <input
                  type="number"
                  min={0}
                  step={10}
                  value={minNotional}
                  onChange={(e) => setMinNotional(Number(e.target.value) || 0)}
                  className="w-20 rounded-sm border border-blue-500/25 bg-transparent px-1.5 py-1 text-ink"
                />
              </label>
              <label className="flex items-center gap-1.5 text-[10px] text-ink-dim">
                <input
                  type="checkbox"
                  checked={watchEnabled}
                  onChange={(e) => {
                    setWatchEnabled(e.target.checked);
                    if (e.target.checked && !activePreset) setActivePreset(EXPLORER_PRESETS[0]);
                  }}
                />
                LoL watch preset
              </label>
              <label className="flex items-center gap-1.5 text-[10px] text-ink-dim">
                <input
                  type="checkbox"
                  checked={watchedOnly}
                  disabled={!watch.length}
                  onChange={(e) => setWatchedOnly(e.target.checked)}
                />
                Watched only
              </label>
              <label className="flex items-center gap-1.5 text-[10px] text-ink-dim">
                <input
                  type="checkbox"
                  checked={showAllTrades}
                  onChange={(e) => setShowAllTrades(e.target.checked)}
                />
                Show all trade bubbles
              </label>
              <button
                type="button"
                className="rounded-sm border border-blue-500/20 px-2 py-1 text-[10px] text-ink-dim hover:text-ink"
                onClick={() => {
                  setReplaying((v) => !v);
                  if (replaying) setPlayhead(null);
                }}
              >
                {replaying ? "Stop replay" : "Replay"}
              </button>
              <button
                type="button"
                className="rounded-sm border border-blue-500/20 px-2 py-1 text-[10px] text-ink-dim hover:text-ink"
                onClick={() => {
                  setBrushRange(null);
                  setPlayhead(null);
                  setFocusedWallet(null);
                  setSideFilter("ALL");
                  setMinNotional(0);
                  setWatchedOnly(false);
                  setInspect(clearTradeInspect());
                  setSelectedMoveId(null);
                  setShowAllTrades(false);
                }}
              >
                Reset view
              </button>
            </div>
          </section>
        )}

        {/* Chart hero */}
        <section className="ascii-panel flex min-h-[420px] flex-1 flex-col rounded-sm">
          <div className="ascii-panel-heading flex flex-wrap items-center gap-3 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-ink-dim">
            <Activity className="h-3.5 w-3.5 text-blue-400" />
            <span>Price · time + interactive trades</span>
            <span className="normal-case tracking-normal">
              Click bubble to inspect · muted unless &quot;Show all&quot; · area ∝ USDC
            </span>
            {payload && (
              <span className="ml-auto normal-case tracking-normal">
                {payload.trades.length} trades
                {payload.tradeFetch ? ` · fills:${payload.tradeFetch.status}` : ""} ·{" "}
                {payload.prices.length} ticks · mode={payload.mode}
              </span>
            )}
          </div>
          <div className="p-2" style={{ minHeight: 420, height: 420 }}>
            {!payload ? (
              <div className="flex h-full min-h-[360px] flex-col items-center justify-center gap-2 text-[12px] text-ink-dim">
                <Link2 className="h-5 w-5 text-blue-400/50" />
                <p>Search any market or paste a Polymarket event link to begin.</p>
                <p className="text-[10px]">Universal explorer — not LoL-only. Read-only; no trading.</p>
              </div>
            ) : (
              <PriceBubbleChart
                outcomes={payload.outcomes}
                prices={payload.prices}
                trades={payload.trades}
                watch={watch}
                selectedTokenIds={selectedTokenIds}
                sideFilter={sideFilter}
                minNotional={minNotional}
                watchedOnly={watchedOnly}
                focusedWallet={focusedWallet}
                playheadTs={playhead}
                brushRange={brushRange}
                onBrushRange={setBrushRange}
                showAllTrades={showAllTrades}
                selectedTradeId={inspect.selectedId}
                selectedMoveId={selectedMoveId}
                moves={significantMoves}
                isolateWallet={inspect.isolateWallet}
                onTradeClick={handleTradeClick}
              />
            )}
          </div>
          {/* Mini timeline / scrubber note — Brush above is the interactive range */}
          <div className="border-t border-blue-500/15 px-3 py-2 text-[10px] text-ink-dim">
            Mini timeline: drag the brush under the chart. Replay playhead never leaks future trades.
            {playhead && <span className="ml-2 phosphor-amber">playhead {formatSgt(playhead)}</span>}
          </div>
        </section>

        {(tradeFetchLive || payload?.tradeFetch) && (
          <section className="ascii-panel rounded-sm px-3 py-2 text-[10px] text-ink-dim" aria-live="polite">
            <span className="uppercase tracking-[0.2em]">› Fills coverage</span>{" "}
            <span className="normal-case tracking-normal text-ink">
              {(tradeFetchLive || payload!.tradeFetch)!.loadedCount} loaded ·{" "}
              {(tradeFetchLive || payload!.tradeFetch)!.pagesFetched} pages ·{" "}
              {(tradeFetchLive || payload!.tradeFetch)!.status}
            </span>
            <span className="ml-2 normal-case tracking-normal">
              {(tradeFetchLive || payload!.tradeFetch)!.note}
            </span>
            {(tradeFetchLive || payload!.tradeFetch)!.hitSafetyCeiling && (
              <span className="ml-2 text-amber">
                Safety ceiling reached — not a complete on-chain archive; use an indexer for full history.
              </span>
            )}
          </section>
        )}

        {payload && inspect.cluster.length > 0 && (
          <TradeInspectPanel
            cluster={inspect.cluster}
            selectedId={inspect.selectedId}
            isolateWallet={inspect.isolateWallet}
            onSelect={(id) => setInspect((s) => pickFromCluster(s, id))}
            onClose={() => setInspect(clearTradeInspect())}
            onToggleIsolate={() =>
              setInspect((s) => ({ ...s, isolateWallet: !s.isolateWallet }))
            }
            onFocusWallet={(w) => setFocusedWallet(w)}
          />
        )}

        {payload && primaryOutcome && (
          <SignificantMovesPanel
            moves={significantMoves}
            windowKey={moveWindow}
            onWindowKey={(k) => {
              setMoveWindow(k);
              setSelectedMoveId(null);
            }}
            selectedMoveId={selectedMoveId}
            onSelectMove={setSelectedMoveId}
            onSelectTradeId={handleSelectTradeId}
            primaryLabel={primaryOutcome.label}
          />
        )}

        {/* Keyboard / mobile trade list fallback */}
        {payload && showAllTrades && (
          <section className="ascii-panel rounded-sm p-3" aria-label="Trade list fallback">
            <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-ink-dim">
              › Trade list (keyboard / mobile fallback)
            </div>
            <ul className="max-h-56 space-y-0.5 overflow-y-auto text-[11px]">
              {payload.trades
                .filter((tr) => selectedTokenIds.has(tr.tokenId))
                .filter((tr) => (sideFilter === "ALL" ? true : tr.side === sideFilter))
                .filter((tr) => tr.notionalUsdc >= minNotional)
                .slice(0, 120)
                .map((tr) => {
                  const label =
                    payload.outcomes.find((o) => o.tokenId === tr.tokenId)?.label || tr.tokenId;
                  return (
                    <li key={tr.id}>
                      <button
                        type="button"
                        className={`flex w-full flex-wrap gap-2 rounded-sm px-1 py-1 text-left hover:bg-blue-500/10 ${
                          inspect.selectedId === tr.id ? "bg-amber/10" : ""
                        }`}
                        onClick={() => handleSelectTradeId(tr.id)}
                      >
                        <span className={tr.side === "BUY" ? "text-cyan" : "text-magenta"}>{tr.side}</span>
                        <span>{label}</span>
                        <span>{formatCents(tr.price)}</span>
                        <span>{formatUsd(tr.notionalUsdc)}</span>
                        <span className="font-mono text-[10px] text-ink-dim">{tr.walletName || tr.wallet.slice(0, 10)}</span>
                        <span className="text-[10px] text-ink-dim">{formatSgt(tr.ts)}</span>
                      </button>
                    </li>
                  );
                })}
            </ul>
          </section>
        )}

        {/* Liquidity strip */}
        {payload && (
          <section className="ascii-panel rounded-sm px-3 py-2 text-[11px]">
            <div className="flex flex-wrap gap-4">
              <span className="text-[10px] uppercase tracking-[0.2em] text-ink-dim">Depth</span>
              {payload.book?.length ? (
                payload.book.map((b) => {
                  const label =
                    payload.outcomes.find((o) => o.tokenId === b.tokenId)?.label || shortToken(b.tokenId);
                  return (
                    <span key={b.tokenId} className="text-ink">
                      {label}: bid {b.bestBid != null ? formatCents(b.bestBid) : "—"} / ask{" "}
                      {b.bestAsk != null ? formatCents(b.bestAsk) : "—"}
                      {b.spread != null ? ` · spread ${(b.spread * 100).toFixed(1)}¢` : ""}
                    </span>
                  );
                })
              ) : (
                <span className="text-ink-dim">Order book unavailable from adapter.</span>
              )}
              <span className="text-ink-dim">
                Model fair unavailable — no point-in-time feed configured.
              </span>
            </div>
          </section>
        )}

        {/* Wallet table */}
        {payload && (
          <WalletTable
            trades={filteredTrades}
            watch={watch}
            asOf={payload.provenance.asOf}
            focusedWallet={focusedWallet}
            onFocusWallet={setFocusedWallet}
          />
        )}

        {/* Provenance */}
        <footer className="ascii-panel rounded-sm px-3 py-2 text-[10px] text-ink-dim">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span>
              asOf {payload ? formatSgt(payload.provenance.asOf) : "—"} · completeness{" "}
              <span className="text-ink">{payload?.provenance.completeness ?? "—"}</span>
            </span>
            <span>
              adapters{" "}
              {Object.entries(payload?.provenance.adapterVersions || health.adapterVersions)
                .map(([k, v]) => `${k}=${v}`)
                .join(" · ")}
            </span>
            {payload?.provenance.warnings.map((w) => (
              <span key={w} className="text-amber">
                ! {w}
              </span>
            ))}
          </div>
        </footer>
      </main>
    </div>
  );
}

function shortToken(id: string) {
  return id.length > 10 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id;
}
