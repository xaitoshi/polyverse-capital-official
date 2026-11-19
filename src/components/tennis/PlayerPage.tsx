import { cents, eloText, formText, pct, rankLabel, statPct, tierLabel, whenLabel } from "../../lib/tennis/format";
import { lastName } from "../../lib/tennis/names";
import type { PlayerProfile } from "../../lib/tennis/types";
import { Flag, Nav, Portrait } from "./bits";

export default function PlayerPage({ id, profile }: { id: string; profile: PlayerProfile | null }) {
  if (!profile) {
    return (
      <div className="tennis-root">
        <Nav active="player" />
        <div className="empty">
          <h1>No profile for this player</h1>
          <p>
            <code>{id}</code> is not in the current singles book. Profiles are built from matches we actually ingested. Missing stats are left blank rather than filled in.
          </p>
          <p><a href="/tennis">Back to the live board</a></p>
        </div>
      </div>
    );
  }
  const p = profile.player;
  const ctx = profile.context;
  const stats: { label: string; value: string; note?: string }[] = [];
  if (p.elo != null) stats.push({ label: "Overall Elo", value: eloText(p.elo), note: p.eloSource ?? undefined });
  if (p.hElo != null) stats.push({ label: "Hard Elo", value: eloText(p.hElo) });
  if (p.cElo != null) stats.push({ label: "Clay Elo", value: eloText(p.cElo) });
  if (p.gElo != null) stats.push({ label: "Grass Elo", value: eloText(p.gElo) });
  if (p.resultRating != null) stats.push({ label: "Recent-window rating", value: eloText(p.resultRating), note: p.resultRatingSource ?? undefined });
  if (p.form && p.form.n > 0) stats.push({ label: "Recent W–L", value: formText(p.form) });
  if (p.serve?.firstInPct != null) stats.push({ label: "1st serve in", value: statPct(p.serve.firstInPct), note: p.serve.source });
  if (p.serve?.firstWonPct != null) stats.push({ label: "1st serve won", value: statPct(p.serve.firstWonPct) });
  if (p.serve?.acePct != null) stats.push({ label: "Ace %", value: statPct(p.serve.acePct) });
  if (p.serve?.bpSavedPct != null) stats.push({ label: "Break pts saved", value: statPct(p.serve.bpSavedPct) });
  const limited = !p.countryCode || p.rank == null || p.elo == null || !p.form || !p.serve;
  return (
    <div className="tennis-root">
      <Nav active="player" />
      <main className="page">
        <div className="profile-head">
          <Portrait player={p} />
          <div>
            <h1>{p.name}</h1>
            <div className="meta-line">
              {p.countryCode && <Flag player={p} />}
              {p.countryName && <span>{p.countryName}</span>}
              {p.rank != null && <span>{p.countryName ? "·" : ""} {rankLabel(p)}</span>}
              {p.rankSource && <span className="muted">({p.rankSource})</span>}
            </div>
            {p.photo && (
              <div className="credit">
                Photo: {p.photo.attribution || (p.photo.source === "espn" ? "ESPN" : "Wikimedia Commons")}
                {p.photo.license ? ` · ${p.photo.license}` : ""}
                {p.photo.source === "espn" ? " · ESPN headshot" : ""}
                {p.photo.pageUrl && (
                  <>
                    {" · "}
                    <a href={p.photo.pageUrl} target="_blank" rel="noopener noreferrer">source</a>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {ctx && (
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-h">
              Current match
              <span className="badge">{ctx.status}</span>
            </div>
            <h2 style={{ fontSize: 18 }}>{p.name} vs <a href={`/tennis/players/${ctx.opponentId}`}>{ctx.opponent}</a></h2>
            <p className="vsline">{tierLabel(ctx.tier)}{ctx.level ? ` ${ctx.level}` : ""} · {ctx.tournament}{ctx.surface ? ` · ${ctx.surface}` : ""} · {whenLabel(ctx.startTime)}</p>
            <div className="prices">
              <div className="ptile"><div className="who">{lastName(p.name)}</div><div className="px">{cents(ctx.ownPrice)}</div></div>
              <div className="ptile"><div className="who">{lastName(ctx.opponent)}</div><div className="px">{cents(ctx.opponentPrice)}</div></div>
            </div>
            <p className="note">{ctx.pickName ? `Locked pick: ${ctx.pickName}` : "No pre-start pick stored for this match."}</p>
            <p className="note"><a href={ctx.polymarketUrl} target="_blank" rel="noopener noreferrer">Polymarket market</a></p>
          </div>
        )}

        {limited && (
          <p className="note" style={{ marginTop: 14 }}>Limited data for this player (source coverage). Figures below are only the ones a source actually published.</p>
        )}
        {stats.length > 0 && (
          <div className="stat-grid">
            {stats.map((s) => (
              <div className="kpi" key={s.label} title={s.note}>
                <div className="l">{s.label}</div>
                <div className="v">{s.value}</div>
              </div>
            ))}
          </div>
        )}
        {stats.some((s) => s.note) && (
          <p className="note">{stats.map((s) => s.note).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(" ")}</p>
        )}

        <h2 style={{ fontSize: 16, marginTop: 22 }}>Our picks on this player</h2>
        {!profile.picks.length ? (
          <p className="note">No pre-start pick has been stored on a match involving {lastName(p.name)}.</p>
        ) : (
          <div className="picks-wrap">
            <table className="picks">
              <thead>
                <tr>
                  <th>When</th><th>Match</th><th>Pick</th><th>Model</th><th>Price then</th><th>Result</th>
                </tr>
              </thead>
              <tbody>
                {profile.picks.map((row) => (
                  <tr key={row.matchId}>
                    <td className="muted">{whenLabel(row.pick.pickedAt)}</td>
                    <td>{row.tournament} · {lastName(row.playerA)} vs {lastName(row.playerB)}</td>
                    <td>{lastName(row.pick.playerName)}{row.pick.value ? <span className="tag-v">VALUE</span> : null}</td>
                    <td>{pct(row.pick.modelProb, 0)}</td>
                    <td>{cents(row.pick.marketPrice)}</td>
                    <td className="muted">
                      {row.result?.kind === "void" ? "Void" : row.result?.pickWon == null ? row.status : row.result.pickWon ? "Won" : "Lost"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {profile.recent.length > 0 && <h2 style={{ fontSize: 16, marginTop: 22 }}>Recent matches</h2>}
        {profile.recent.length > 0 && (
          <div className="picks-wrap">
            <table className="picks">
              <thead>
                <tr>
                  <th>Date</th><th>Tournament</th><th>Surface</th><th>Rd</th><th>Opponent</th><th></th><th>Score</th><th>1st in</th>
                </tr>
              </thead>
              <tbody>
                {profile.recent.map((r, i) => (
                  <tr key={`${r.date}-${i}`}>
                    <td className="muted">{r.date}</td>
                    <td>{r.tournament}</td>
                    <td>{r.surface || "—"}</td>
                    <td>{r.round || "—"}</td>
                    <td>{r.opponentId ? <a href={`/tennis/players/${r.opponentId}`}>{r.opponent}</a> : r.opponent || "—"}</td>
                    <td>{r.result === "unplayed" ? "—" : r.result}</td>
                    <td className="muted">{r.score || "—"}</td>
                    <td>{statPct(r.firstInPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="note" style={{ marginTop: 16 }}><a href="/tennis">Back to the live board</a></p>
      </main>
    </div>
  );
}
