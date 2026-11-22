import { useEffect, useMemo, useState } from "react";
import { boardMatches } from "../../lib/tennis/boardFilter";
import { selectHero } from "../../lib/tennis/grade";
import {
  caption,
  cents,
  edgeText,
  eloText,
  formText,
  money,
  pct,
  rankLabel,
  recordText,
  roiText,
  scoreLine,
  statPct,
  surfaceElo,
  tierLabel,
  whenLabel,
} from "../../lib/tennis/format";
import { lastName } from "../../lib/tennis/names";
import { skillGap } from "../../lib/tennis/skillGap";
import { readTennisFilters, writeTennisFilters, type TourFilter } from "../../lib/tennis/urlState";
import type { BoardView, MatchStatus, MatchView, PlayerSummary } from "../../lib/tennis/types";
import { Flag, Nav, Portrait, ShareLink } from "./bits";
import CourtSvg from "./CourtSvg";

const TOURS: { id: TourFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "atp", label: "ATP" },
  { id: "wta", label: "WTA" },
  { id: "challenger", label: "Challenger" },
  { id: "itf", label: "ITF" },
];

const STATUSES: { id: "all" | "live" | "upcoming"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "live", label: "Live" },
  { id: "upcoming", label: "Upcoming" },
];

function statusWord(s: MatchStatus): string {
  if (s === "live") return "Live";
  if (s === "suspended") return "Suspended";
  if (s === "upcoming") return "Upcoming";
  if (s === "void") return "Void";
  return "Final";
}

function PlayerStats({ player, surface }: { player: PlayerSummary; surface: MatchView["surface"] }) {
  const elo = surfaceElo(player, surface);
  const rows: [string, string][] = [
    ["Rank", rankLabel(player)],
    [elo.label, eloText(elo.value)],
    ["Recent", formText(player.form)],
    ["Ace %", statPct(player.serve?.acePct)],
    ["Double faults", statPct(player.serve?.dfPct)],
    ["1st serve in", statPct(player.serve?.firstInPct)],
    ["1st serve won", statPct(player.serve?.firstWonPct)],
  ];
  return (
    <div className="stats">
      <table>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td>{k}</td>
              <td className="v">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="src">{player.serve?.source || player.eloSource || player.rankSource || "No charted sample"}</div>
    </div>
  );
}

function ScoreTable({ match }: { match: MatchView }) {
  const cols = Math.max(match.sets.length, 1);
  const current = match.status === "finished" || match.status === "void" ? -1 : match.sets.length - 1;
  return (
    <table className="board">
      <thead>
        <tr>
          <th />
          {Array.from({ length: cols }, (_, i) => (
            <th key={i} className={i === current ? "on" : undefined}>
              S{i + 1}
            </th>
          ))}
          <th>Pts</th>
          <th>Sets</th>
        </tr>
      </thead>
      <tbody>
        {(["a", "b"] as const).map((side) => {
          const name = side === "a" ? match.playerA.name : match.playerB.name;
          const setsWon = side === "a" ? match.setsWonA : match.setsWonB;
          return (
            <tr key={side}>
              <td className="who">{lastName(name)}</td>
              {Array.from({ length: cols }, (_, i) => {
                const set = match.sets[i];
                const val = set ? (side === "a" ? set.a : set.b) : null;
                return (
                  <td key={i} className={i === current ? "on" : "dim"}>
                    {val == null ? "—" : val}
                  </td>
                );
              })}
              <td className="dim">—</td>
              <td className={setsWon > 0 ? undefined : "dim"}>{match.sets.length ? setsWon : "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function TennisPage({ board }: { board: BoardView }) {
  const initialFilters = readTennisFilters(window.location.search);
  const listed = useMemo(
    () => boardMatches(board.matches, Date.now(), board.source),
    [board.matches, board.source],
  );
  const [matchId, setMatchId] = useState(() => selectHero(listed)?.id ?? "");
  const [tab, setTab] = useState<"court" | "odds" | "stats">("court");
  const [tier, setTier] = useState<TourFilter>(initialFilters.tour);
  const [status, setStatus] = useState<(typeof STATUSES)[number]["id"]>("all");
  const [valueOnly, setValueOnly] = useState(initialFilters.value);
  const [skillOnly, setSkillOnly] = useState(initialFilters.skillGap);

  const passesExtras = (m: MatchView) => {
    if (status === "live" && m.status !== "live") return false;
    if (status === "upcoming" && m.status !== "upcoming") return false;
    if (valueOnly && !m.pick?.value) return false;
    if (skillOnly && !skillGap(m)) return false;
    return true;
  };

  const toured = useMemo(
    () => (tier === "all" ? listed : listed.filter((m) => m.tier === tier)),
    [listed, tier],
  );
  const pool = useMemo(() => {
    const live = toured.filter((m) => m.status === "live");
    if (live.length) return live;
    return toured.filter((m) => m.status === "upcoming");
  }, [toured]);

  useEffect(() => {
    if (toured.some((m) => m.id === matchId)) return;
    setMatchId(selectHero(toured)?.id ?? "");
  }, [toured, matchId]);

  useEffect(() => {
    const next = writeTennisFilters(window.location.search, {
      tour: tier,
      value: valueOnly,
      skillGap: skillOnly,
    });
    const url = `${window.location.pathname}${next}`;
    if (`${window.location.pathname}${window.location.search}` !== url) {
      window.history.replaceState(null, "", url);
    }
  }, [tier, valueOnly, skillOnly]);

  const match = toured.find((m) => m.id === matchId) ?? selectHero(toured);
  const idx = match ? pool.findIndex((m) => m.id === match.id) : -1;

  const rows = toured.filter(passesExtras);
  const counted = listed.filter(passesExtras);
  const tourCounts: Record<TourFilter, number> = {
    all: counted.length,
    atp: counted.filter((m) => m.tier === "atp").length,
    wta: counted.filter((m) => m.tier === "wta").length,
    challenger: counted.filter((m) => m.tier === "challenger").length,
    itf: counted.filter((m) => m.tier === "itf").length,
  };

  const inPlay = listed.filter((m) => m.status === "live").slice(0, 3);
  const soon = listed.filter((m) => m.status === "upcoming" && m.pick).slice(0, 4);
  const book = [...inPlay, ...soon].slice(0, 7);
  const counts = {
    live: listed.filter((m) => m.status === "live").length,
    upcoming: listed.filter((m) => m.status === "upcoming").length,
  };

  const filterBar = (
    <div className="filters">
      <div className="tour-chips" role="tablist" aria-label="Tour">
        {TOURS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tier === t.id}
            className={tier === t.id ? "tour-chip on" : "tour-chip"}
            onClick={() => setTier(t.id)}
          >
            {t.label}
            <span>{tourCounts[t.id]}</span>
          </button>
        ))}
      </div>
      <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
        {STATUSES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
      </select>
      <label>
        <input type="checkbox" checked={valueOnly} onChange={(e) => setValueOnly(e.target.checked)} />
        Value only
      </label>
      <label>
        <input type="checkbox" checked={skillOnly} onChange={(e) => setSkillOnly(e.target.checked)} />
        Skill gap
      </label>
    </div>
  );

  if (!listed.length) {
    return (
      <div className="tennis-root">
        <Nav active="tennis" />
        <div className="empty">
          <h1>No open singles matches</h1>
          <p>{board.notes[0] || "The book is empty. Markets show up after ingest, and only with the numbers each source actually returned."}</p>
        </div>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="tennis-root">
        <Nav active="tennis" />
        <section className="below">
          <h3>Today’s picks</h3>
          {filterBar}
          <p className="note">No matches in this tour.</p>
        </section>
      </div>
    );
  }

  const pickedSide = match.pick?.side ?? null;
  const gap = skillGap(match);
  const modelLabel = match.pick
    ? `${match.pick.confidence} · ${match.pick.coverage}`
    : "No locked pick";
  const surfaceBit = match.surface ?? "Surface —";
  const roundBit = match.round ? ` · ${match.round}` : "";
  const levelBit = match.level ? ` · ${match.level}` : "";

  return (
    <div className="tennis-root">
      <Nav active="tennis" />
      <section className="hero">
        <div className="stage">
          <div className="scoreboard">
            <SideHead player={match.playerA} serving={match.server === "a"} />
            <div className="sb-center">
              <div className="tour">
                {match.status === "live" || match.status === "suspended" ? (
                  <span className="live">{statusWord(match.status)}</span>
                ) : (
                  <span>{statusWord(match.status)} · </span>
                )}
                {match.tournament}
                {roundBit}
                {levelBit}
                {" · "}
                {surfaceBit}
              </div>
              {match.sets.length ? <ScoreTable match={match} /> : <div className="tour" style={{ marginTop: 8 }}>{whenLabel(match.startTime)}</div>}
            </div>
            <SideHead player={match.playerB} serving={match.server === "b"} align="right" />
          </div>

          {pool.length > 1 && (
            <div className="selector">
              <button type="button" disabled={idx <= 0} onClick={() => idx > 0 && setMatchId(pool[idx - 1]!.id)} aria-label="Previous match">
                Prev
              </button>
              <select aria-label="Choose match" value={pool.some((m) => m.id === match.id) ? match.id : ""} onChange={(e) => setMatchId(e.target.value)}>
                {!pool.some((m) => m.id === match.id) && <option value={match.id}>{match.tournament}</option>}
                {pool.map((m) => (
                  <option key={m.id} value={m.id}>
                    {statusWord(m.status)} · {m.tournament}: {lastName(m.playerA.name)} vs {lastName(m.playerB.name)}
                  </option>
                ))}
              </select>
              <button type="button" disabled={idx < 0 || idx >= pool.length - 1} onClick={() => idx >= 0 && idx < pool.length - 1 && setMatchId(pool[idx + 1]!.id)} aria-label="Next match">
                Next
              </button>
            </div>
          )}

          <div className="tabs" role="tablist">
            {(["court", "odds", "stats"] as const).map((id) => (
              <button key={id} className={tab === id ? "tab on" : "tab"} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
                {id[0]!.toUpperCase() + id.slice(1)}
              </button>
            ))}
          </div>

          {tab === "court" && (
            <div className="court-row">
              <PlayerCol player={match.playerA} surface={match.surface} />
              <div className="court-frame">
                <CourtSvg />
              </div>
              <PlayerCol player={match.playerB} surface={match.surface} />
            </div>
          )}
          {tab === "odds" && (
            <div className="center-panel">
              <h3>Polymarket match winner</h3>
              <div className="price-hero">
                <div>
                  <div className="who">{match.playerA.name}</div>
                  <div className="px">{cents(match.priceA)}</div>
                </div>
                <div>
                  <div className="who">{match.playerB.name}</div>
                  <div className="px">{cents(match.priceB)}</div>
                </div>
              </div>
              <p className="note">Volume {money(match.volume)}. Prices are the posted Polymarket mid. This page does not send an order.</p>
              <p className="note">
                <a href={match.polymarketUrl} target="_blank" rel="noopener noreferrer">Market page on Polymarket</a>
              </p>
            </div>
          )}
          {tab === "stats" && (
            <div className="center-panel">
              <table className="cmp">
                <thead>
                  <tr>
                    <th>{lastName(match.playerA.name)}</th>
                    <th>Stat</th>
                    <th>{lastName(match.playerB.name)}</th>
                  </tr>
                </thead>
                <tbody>
                  <Cmp a={rankLabel(match.playerA)} label="Rank" b={rankLabel(match.playerB)} />
                  <Cmp a={eloText(surfaceElo(match.playerA, match.surface).value)} label={surfaceElo(match.playerA, match.surface).label} b={eloText(surfaceElo(match.playerB, match.surface).value)} />
                  <Cmp a={eloText(match.playerA.elo)} label="Overall Elo" b={eloText(match.playerB.elo)} />
                  <Cmp a={formText(match.playerA.form)} label="Recent W–L" b={formText(match.playerB.form)} />
                  <Cmp a={statPct(match.playerA.serve?.firstInPct)} label="1st serve in" b={statPct(match.playerB.serve?.firstInPct)} />
                  <Cmp a={statPct(match.playerA.serve?.firstWonPct)} label="1st serve won" b={statPct(match.playerB.serve?.firstWonPct)} />
                  <Cmp a={statPct(match.playerA.serve?.bpSavedPct)} label="Break pts saved" b={statPct(match.playerB.serve?.bpSavedPct)} />
                  <Cmp
                    a={match.playerA.recentH2h ? `${match.playerA.recentH2h.w}–${match.playerA.recentH2h.l}` : "—"}
                    label="H2H in TA window"
                    b={match.playerB.recentH2h ? `${match.playerB.recentH2h.w}–${match.playerB.recentH2h.l}` : "—"}
                  />
                </tbody>
              </table>
              <p className="note">{match.surfaceSource || "Surface was not in the sources for this match, so the model uses overall Elo or a rank prior."}</p>
            </div>
          )}

          <div className="caption">
            {(match.status === "live" || match.status === "suspended") && <i />}
            {caption(match)}
          </div>
          {match.sets.length > 0 && (
            <div className="timeline">
              {match.sets.map((s, i) => (
                <span key={i} style={{ display: "contents" }}>
                  {i > 0 && <span className="tline" />}
                  <span className="tstep">
                    <span className={s.complete ? "tdot done" : "tdot on"} />
                    Set {i + 1} · {s.a}–{s.b}
                    {s.tiebreak ? ` (${s.tiebreak})` : ""}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>

        <aside className="sidebar">
          <div className="card">
            <div className="card-h">
              Trade with Polyverse AI
              <span style={{ display: "flex", gap: 6 }}>
                {gap && <span className="badge skill" title={gap.note}>Skill gap</span>}
                <span className={`badge ${match.pick?.confidence ?? ""}`}>{match.pick ? match.pick.confidence : "Picks only"}</span>
              </span>
            </div>
            <h2>Match winner</h2>
            <div className="vsline">
              {lastName(match.playerA.name)} vs {lastName(match.playerB.name)} · {match.tournament}
              {levelBit}
            </div>
            <div className="prices">
              <ShareLink className={pickedSide === "a" ? "ptile on" : "ptile"}>
                <div className="who">{lastName(match.playerA.name)}</div>
                <div className="px">{cents(match.priceA)}</div>
              </ShareLink>
              <ShareLink className={pickedSide === "b" ? "ptile on" : "ptile"}>
                <div className="who">{lastName(match.playerB.name)}</div>
                <div className="px">{cents(match.priceB)}</div>
              </ShareLink>
            </div>
            <div className="conf">
              <div>
                <div className="big">{match.pick ? pct(match.pick.modelProb, 0) : "—"}</div>
                <div className="lab">{modelLabel}{match.pick ? ` · ${lastName(match.pick.playerName)}` : ""}</div>
              </div>
              <div className="right">
                <b>{match.pick ? (match.surface ? `Pre-match ${match.surface.toLowerCase()} Elo` : "Pre-match Elo") : "Not locked"}</b>
                {match.pick ? `${cents(match.pick.marketPrice)} at pick · edge ${edgeText(match.pick.edgePp)}` : "Written only before the start"}
                {match.pick?.value && <div className="tag-v">VALUE</div>}
                {gap && <div className="tag-sg" title={gap.note}>SKILL GAP</div>}
              </div>
            </div>
            <div className="note">
              {match.pick
                ? `Locked ${new Date(match.pick.pickedAt).toLocaleString()} · ${match.pick.inputsVersion}. ${match.pick.coverage === "market" ? "Low data: the model fell back to the market price." : "The number is the pre-match model, not an in-play update."}`
                : "This match was already underway when the book first saw it. Polyverse does not backfill a pick after the start."}
            </div>
            <div className="amt">
              <div className="row">
                <span className="lab">Amount</span>
                <span className="val">$25</span>
              </div>
              <div className="chips">
                <ShareLink className="chip">$10</ShareLink>
                <ShareLink className="chip on">$25</ShareLink>
                <ShareLink className="chip">$100</ShareLink>
              </div>
            </div>
            <ShareLink className="cta">
              {match.pick ? `Review ${lastName(match.pick.playerName)} · $25` : "View on Share"}
            </ShareLink>
            <div className="cta-sub">Trades on Share · Polyverse shows picks and stats only</div>
          </div>

          <div className="card book">
            <div className="card-h">
              Today’s book <span className="badge">{board.record.settled ? "Settled picks on the record" : "No settled picks yet"}</span>
            </div>
            <div className="kpis">
              <div className="kpi"><div className="l">W–L</div><div className="v">{board.record.settled ? recordText(board.record.wins, board.record.losses) : "—"}</div></div>
              <div className="kpi"><div className="l">Win rate</div><div className="v">{board.record.winRate == null ? "—" : pct(board.record.winRate, 1)}</div></div>
              <div className="kpi"><div className="l">Flat ROI</div><div className="v">{roiText(board.record.roi)}</div></div>
            </div>
            <ul className="blist">
              {book.map((m) => (
                <li key={m.id}>
                  <button type="button" onClick={() => setMatchId(m.id)}>
                    {lastName(m.playerA.name)} vs {lastName(m.playerB.name)}
                  </button>
                  <span className={m.status === "live" || m.status === "suspended" ? "st live" : "st"}>
                    {m.status === "upcoming" ? whenLabel(m.startTime) : statusWord(m.status)}
                    {m.pick ? ` · pick ${lastName(m.pick.playerName)}` : " · no pick"}
                    {m.pick?.value ? " · VALUE" : ""}
                    {skillGap(m) ? " · skill gap" : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </section>

      <a className="strip" href="/tennis/record">
        <div><div className="l">W–L</div><div className="v">{board.record.settled ? recordText(board.record.wins, board.record.losses) : "—"}</div></div>
        <div><div className="l">Win rate</div><div className="v">{board.record.winRate == null ? "—" : pct(board.record.winRate, 1)}</div></div>
        <div><div className="l">Value W–L</div><div className="v">{board.record.valueSettled ? recordText(board.record.valueWins, board.record.valueLosses) : "—"}</div></div>
        <div><div className="l">Flat-stake ROI</div><div className="v">{roiText(board.record.roi)}</div></div>
        <div><div className="l">Brier</div><div className="v">{board.record.brier == null ? "—" : board.record.brier.toFixed(3)}</div></div>
        <div><div className="l">Pending picks</div><div className="v">{board.record.pending}</div></div>
        <div className="go">Full public record, by tier and surface →</div>
      </a>

      <section className="below">
        <h3>Today’s picks</h3>
        {filterBar}
        <div className="picks-wrap">
          <table className="picks">
            <thead>
              <tr>
                <th>Status</th>
                <th>Tour</th>
                <th>Match</th>
                <th>Score</th>
                <th>Pick</th>
                <th>Model</th>
                <th>Market</th>
                <th>Edge</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td><span className={m.status === "live" || m.status === "suspended" ? "pill live" : "pill"}>{statusWord(m.status)}</span></td>
                  <td>
                    <span className={`pill ${m.tier}`}>{tierLabel(m.tier)}{m.level ? ` ${m.level}` : ""}</span>
                  </td>
                  <td>
                    <button type="button" className="rowlink" onClick={() => setMatchId(m.id)} style={{ background: "none", border: 0, color: "inherit", font: "inherit", cursor: "pointer", padding: 0, textAlign: "left" }}>
                      {m.tournament} · {lastName(m.playerA.name)} vs {lastName(m.playerB.name)}
                    </button>
                  </td>
                  <td className="muted">{m.status === "upcoming" ? whenLabel(m.startTime) : scoreLine(m)}</td>
                  <td>
                    {m.pick ? (
                      <>
                        {lastName(m.pick.playerName)}
                        {m.pick.value && <span className="tag-v">VALUE</span>}
                        {skillGap(m) && <span className="tag-sg" title={skillGap(m)!.note}>SKILL GAP</span>}
                        <div className="muted" style={{ fontSize: 10 }}>{m.pick.confidence}</div>
                      </>
                    ) : <span className="muted">—</span>}
                  </td>
                  <td>{m.pick ? pct(m.pick.modelProb, 0) : "—"}</td>
                  <td className="muted">{cents(m.priceA)} / {cents(m.priceB)}</td>
                  <td className="muted">{m.pick ? edgeText(m.pick.edgePp) : "—"}</td>
                  <td><ShareLink className="trade">Trade</ShareLink></td>
                </tr>
              ))}
              {!rows.length && (
                <tr><td colSpan={9} className="muted">Nothing matches these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="two">
          <div className="chart-card">
            <h3>Track record</h3>
            {board.record.settled ? (
              <p className="note">
                {recordText(board.record.wins, board.record.losses)} · win rate {pct(board.record.winRate, 1)} · Brier {board.record.brier?.toFixed(3)} · log loss {board.record.logLoss?.toFixed(3)}. Flat 1u at the pick-time price.
              </p>
            ) : (
              <div className="wm">No settled book yet</div>
            )}
            <p className="note"><a href="/tennis/record">Open the full record and the methodology</a></p>
          </div>
          <div className="uni">
            <h3>Universe today</h3>
            <div className="uni-grid">
              <div className="kpi"><div className="l">Live</div><div className="v">{counts.live}</div></div>
              <div className="kpi"><div className="l">Upcoming</div><div className="v">{counts.upcoming}</div></div>
              <div className="kpi"><div className="l">Featured volume</div><div className="v">{money(match.volume)}</div></div>
            </div>
            <p className="note">ATP + WTA + Challenger + ITF singles. Doubles excluded.</p>
          </div>
        </div>
      </section>
      <footer className="foot">
        {board.notes.map((n) => (
          <div key={n}>{n}</div>
        ))}
        <div>Generated {board.generatedAt} · {board.inputsVersion} · source {board.source}. Polyverse does not execute trades.</div>
      </footer>
    </div>
  );
}

function SideHead({ player, serving, align }: { player: PlayerSummary; serving: boolean; align?: "right" }) {
  return (
    <div className={align === "right" ? "sb-side right" : "sb-side"}>
      <div>
        <div className="sb-name">
          {serving && <span className="serve-dot" title="Serving" />}{" "}
          <a href={`/tennis/players/${player.id}`}>{player.name}</a>
        </div>
        <div className="sb-sub">
          {align !== "right" && <Flag player={player} />}
          {player.countryName || "Country —"}
          {player.rank != null ? ` · ${rankLabel(player)}` : ""}
          {align === "right" && <Flag player={player} />}
        </div>
      </div>
    </div>
  );
}

function PlayerCol({ player, surface }: { player: PlayerSummary; surface: MatchView["surface"] }) {
  return (
    <div className="side-col">
      <a href={`/tennis/players/${player.id}`}><Portrait player={player} /></a>
      <div className="pname"><a href={`/tennis/players/${player.id}`}>{player.name}</a></div>
      <div className="pcountry"><Flag player={player} /> {player.countryName || "—"}</div>
      <PlayerStats player={player} surface={surface} />
    </div>
  );
}

function Cmp({ a, label, b }: { a: string; label: string; b: string }) {
  return (
    <tr>
      <td className="n">{a}</td>
      <td className="l">{label}</td>
      <td className="n">{b}</td>
    </tr>
  );
}
