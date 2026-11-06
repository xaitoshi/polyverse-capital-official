import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Gamepad2, Search, X } from "lucide-react";
import type {
  LolesportsIndex,
  MethodologyDoc,
  TeamCard,
  TeamIndexEntry,
  TierFilter,
} from "../../lib/lolesports/types";
import { pickDefaultTeam, searchTeams } from "../../lib/lolesports/search";
import {
  parseLolesportsSearchParams,
  writeLolesportsQuery,
} from "../../lib/lolesports/urlState";
import { fmtPct, fmtRecord, fmtSigned, gradeClass } from "../../lib/lolesports/format";
import GradeBadge from "./GradeBadge";
import RosterTable from "./RosterTable";
import DraftingPanel from "./DraftingPanel";
import SidePickChart from "./SidePickChart";
import OffMetaPanel from "./OffMetaPanel";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "error"; message: string };

export default function LolesportsPage() {
  const initial = parseLolesportsSearchParams(window.location.search);
  const [index, setIndex] = useState<LolesportsIndex | null>(null);
  const [methodDoc, setMethodDoc] = useState<MethodologyDoc | null>(null);
  const [card, setCard] = useState<TeamCard | null>(null);
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });
  const [cardLoad, setCardLoad] = useState<string | null>(null);
  const [query, setQuery] = useState(initial.q || "");
  const [tier, setTier] = useState<TierFilter>(initial.tier);
  const [selectedId, setSelectedId] = useState<string | undefined>(initial.team);
  const [showHits, setShowHits] = useState(false);
  const [showMethod, setShowMethod] = useState(!!initial.method);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [idxRes, methRes] = await Promise.all([
          fetch("/lolesports/index.json"),
          fetch("/lolesports/methodology.json"),
        ]);
        if (!idxRes.ok) throw new Error(`index ${idxRes.status}`);
        const idx = (await idxRes.json()) as LolesportsIndex;
        const meth = methRes.ok ? ((await methRes.json()) as MethodologyDoc) : null;
        if (cancelled) return;
        setIndex(idx);
        setMethodDoc(meth);
        setLoad({ kind: "ready" });
        const fromUrl = initial.team
          ? idx.teams.find((t) => t.id === initial.team)
          : null;
        const fallback = fromUrl || pickDefaultTeam(idx.teams);
        if (fallback) setSelectedId(fallback.id);
      } catch (e) {
        if (!cancelled) {
          setLoad({
            kind: "error",
            message: e instanceof Error ? e.message : "Failed to load index",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setCardLoad(selectedId);
    (async () => {
      try {
        const r = await fetch(`/lolesports/teams/${selectedId}.json`);
        if (!r.ok) throw new Error(`team ${r.status}`);
        const data = (await r.json()) as TeamCard;
        if (cancelled) return;
        setCard(data);
        setCardLoad(null);
      } catch (e) {
        if (!cancelled) {
          setCard(null);
          setCardLoad(null);
          setLoad({
            kind: "error",
            message: e instanceof Error ? e.message : "Failed to load team",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  useEffect(() => {
    writeLolesportsQuery({
      team: selectedId,
      q: query || undefined,
      tier: tier === "all" ? undefined : tier,
      method: showMethod ? "1" : undefined,
    });
  }, [selectedId, query, tier, showMethod]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setShowHits(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const hits = useMemo(() => {
    if (!index) return [] as TeamIndexEntry[];
    return searchTeams(index.teams, query, tier, 20);
  }, [index, query, tier]);

  const selectTeam = useCallback((t: TeamIndexEntry) => {
    setSelectedId(t.id);
    setQuery(t.name);
    setShowHits(false);
  }, []);

  if (load.kind === "loading") {
    return (
      <div className="min-h-screen bg-[#04070c] flex items-center justify-center font-mono">
        <span className="text-[10px] uppercase tracking-[0.3em] text-blue-400/50">
          LOADING LOLESPORTS<span className="blink">_</span>
        </span>
      </div>
    );
  }

  if (load.kind === "error" && !index) {
    return (
      <div className="min-h-screen bg-[#04070c] flex items-center justify-center font-mono p-6">
        <div className="ascii-panel rounded-sm p-6 max-w-md space-y-2">
          <div className="text-rose-300 text-sm">Failed to load /lolesports data</div>
          <div className="text-[11px] text-ink-dim">{load.message}</div>
        </div>
      </div>
    );
  }

  const meta = index!.meta;
  const intl = card?.kpis.international;
  const intlLabel =
    intl && (intl.wins > 0 || intl.losses > 0)
      ? `${fmtRecord(intl.wins, intl.losses)}${
          intl.by_event.length
            ? ` (${intl.by_event.map((e) => `${e.league} ${e.w}–${e.l}`).join(", ")})`
            : ""
        }`
      : "—";

  return (
    <div className="min-h-screen bg-[#04070c] text-ink font-mono">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#04070c]/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3 justify-between">
          <a href="/" className="flex items-center gap-2 phosphor text-sm tracking-[0.2em] uppercase">
            <Gamepad2 className="w-4 h-4" />
            Polyverse / LoL Esports
          </a>
          <div className="flex items-center gap-2 text-[10px] text-ink-dim">
            <span>
              OE coverage {meta.coverage.start} → {meta.coverage.end}
            </span>
            <span className="hidden sm:inline">·</span>
            <span className="hidden sm:inline">{meta.scoring_version}</span>
            <button
              type="button"
              onClick={() => setShowMethod((v) => !v)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-sm border border-white/15 hover:border-cyan-400/40 text-ink"
              aria-expanded={showMethod}
            >
              <BookOpen className="w-3 h-3" /> Methodology
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-5">
        <section className="ascii-panel rounded-sm p-4 space-y-3" ref={wrapRef}>
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <h1 className="text-sm uppercase tracking-[0.25em] phosphor">Team profiles</h1>
            <div className="flex gap-1 text-[10px]" role="tablist" aria-label="Tier filter">
              {(
                [
                  ["all", "All"],
                  ["majors", "Majors"],
                  ["academy_erl", "Academy / ERL"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tier === id}
                  onClick={() => setTier(id)}
                  className={`px-3 py-1.5 rounded-sm border uppercase tracking-wider ${
                    tier === id
                      ? "border-cyan-400/50 bg-cyan-500/10 text-cyan-300"
                      : "border-white/10 text-ink-dim hover:border-white/25"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-dim" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShowHits(true);
              }}
              onFocus={() => setShowHits(true)}
              placeholder="Search teams (DK ≠ DK Challengers)"
              aria-label="Search LoL teams"
              className="w-full bg-black/40 border border-white/15 rounded-sm pl-10 pr-10 py-2.5 text-sm text-ink placeholder:text-ink-dim/60 focus:outline-none focus:border-cyan-400/50"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-dim hover:text-ink"
                onClick={() => {
                  setQuery("");
                  setShowHits(true);
                }}
              >
                <X className="w-4 h-4" />
              </button>
            )}
            {showHits && (
              <ul
                className="absolute z-30 mt-1 w-full max-h-72 overflow-y-auto ascii-panel rounded-sm border border-cyan-400/20"
                role="listbox"
              >
                {hits.length === 0 ? (
                  <li className="px-4 py-3 text-[11px] text-ink-dim">No teams match.</li>
                ) : (
                  hits.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={t.id === selectedId}
                        onClick={() => selectTeam(t)}
                        className="w-full text-left px-4 py-2.5 hover:bg-cyan-500/5 border-b border-white/5 last:border-0"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="text-sm text-ink">{t.name}</div>
                            <div className="text-[10px] text-ink-dim">
                              {t.home_league} · {t.tier} · {fmtRecord(t.wins, t.losses)}
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <span className={`text-[10px] px-1.5 py-0.5 border rounded-sm ${gradeClass(t.strength_grade)}`}>
                              S {t.strength_grade ?? "—"}
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.5 border rounded-sm ${gradeClass(t.drafting_grade)}`}>
                              D {t.drafting_grade ?? "—"}
                            </span>
                          </div>
                        </div>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
          <p className="text-[10px] text-ink-dim">
            {meta.counts.majors} majors · {meta.counts.academy_erl} academy/ERL · season{" "}
            {meta.coverage.season_year}. Honest cutoff — raw OE not refreshed past{" "}
            {meta.coverage.end}.
          </p>
        </section>

        {showMethod && methodDoc && (
          <section className="ascii-panel rounded-sm p-4 space-y-3" aria-label="Methodology">
            <h2 className="text-[11px] uppercase tracking-[0.25em] phosphor">{methodDoc.title}</h2>
            <p className="text-[11px] text-amber-200/90">{methodDoc.not_copied}</p>
            <ul className="space-y-2 text-[11px] text-ink-dim leading-relaxed">
              {Object.entries(methodDoc.formulas).map(([k, v]) => (
                <li key={k}>
                  <span className="text-cyan-300/90">{k}:</span> {v}
                </li>
              ))}
            </ul>
          </section>
        )}

        {cardLoad && (
          <div className="text-[10px] uppercase tracking-[0.25em] text-ink-dim">Loading team…</div>
        )}

        {card && (
          <>
            <section className="ascii-panel rounded-sm p-4 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-ink-dim">
                    {card.home_league} · {card.tier}
                  </div>
                  <h2 className="text-2xl sm:text-3xl text-ink mt-1">{card.name}</h2>
                  <p className="text-[11px] text-ink-dim mt-2 max-w-3xl leading-relaxed">
                    {card.summary}
                  </p>
                  {card.best_player && (
                    <p className="text-[11px] text-cyan-300/90 mt-2">
                      Best rating sample: {card.best_player.player} ({card.best_player.role},{" "}
                      {card.best_player.rating})
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <GradeBadge label="Strength" grade={card.grades.strength} />
                  <GradeBadge label="Drafting" grade={card.grades.drafting} />
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Kpi
                  label={`${card.window.season_year} record`}
                  value={fmtPct(card.kpis.record.win_rate)}
                  sub={`${fmtRecord(card.kpis.record.wins, card.kpis.record.losses)} · ${card.kpis.record.games} maps`}
                />
                <Kpi label="International" value={intlLabel.split(" (")[0]} sub={intl?.by_event.map((e) => `${e.league} ${e.w}–${e.l}`).join(" · ") || card.kpis.international.note} />
                <Kpi
                  label="Gold diff @15"
                  value={fmtSigned(card.kpis.golddiffat15.mean, 0)}
                  sub={card.kpis.golddiffat15.mean == null ? "missing" : `n=${card.kpis.golddiffat15.n}`}
                />
                <Kpi
                  label="Power rank"
                  value={
                    card.kpis.power_rank.rank != null && card.kpis.power_rank.of != null
                      ? `${card.kpis.power_rank.rank} of ${card.kpis.power_rank.of}`
                      : "—"
                  }
                  sub={card.kpis.power_rank.scope}
                />
              </div>

              {card.gaps.length > 0 && (
                <div className="text-[10px] text-amber-200/80 border border-amber-400/20 bg-amber-500/5 rounded-sm px-3 py-2">
                  Gaps: {card.gaps.join(" · ")}
                </div>
              )}
            </section>

            <RosterTable roster={card.roster} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <DraftingPanel card={card} />
              <SidePickChart card={card} />
            </div>

            <OffMetaPanel card={card} />

            <footer className="text-[10px] text-ink-dim space-y-1 pb-10">
              <p>
                Source: Oracle&apos;s Elixir public CSVs · scoring {card.scoring_version} · window{" "}
                {String(card.window.start)} → {String(card.window.end)}
              </p>
              <p>
                Strength is descriptive Elo; drafting is a labeled proxy. Missing fields are shown as
                — / omitted, never as zero.
              </p>
              <p>
                <a className="text-cyan-300/80 hover:underline" href="/esports">
                  ← Live esports desk
                </a>
                {" · "}
                <a className="text-cyan-300/80 hover:underline" href="/visualise">
                  Market visualise
                </a>
              </p>
            </footer>
          </>
        )}

        {!card && !cardLoad && load.kind === "ready" && (
          <div className="ascii-panel rounded-sm p-6 text-[12px] text-ink-dim">
            Select a team to view its profile.
          </div>
        )}
      </main>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border border-white/10 rounded-sm p-3 bg-black/25">
      <div className="text-[9px] uppercase tracking-[0.2em] text-ink-dim">{label}</div>
      <div className="text-lg text-ink mt-1 break-words">{value}</div>
      {sub && <div className="text-[9px] text-ink-dim mt-1 leading-snug">{sub}</div>}
    </div>
  );
}
