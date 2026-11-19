import { cents, eloText, formText, pct, rankLabel, statPct, whenLabel } from "../../lib/tennis/format";
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
  return (
    <div className="tennis-root">
      <Nav active="player" />
      <main className="page">
        <div className="profile-head">
          <Portrait player={p} />
          <div>
            <h1>{p.name}</h1>
            <div className="meta-line">
              <Flag player={p} />
              <span>{p.countryName || "Country —"}</span>
              <span>·</span>
              <span>{rankLabel(p)}</span>
              {p.rankSource && <span className="muted">({p.rankSource})</span>}
            </div>
            {p.photo && (
              <div className="credit">
                Photo: {p.photo.attribution || "Wikimedia Commons"}
                {p.photo.license ? ` · ${p.photo.license}` : ""}
                {p.photo.pageUrl && (
                  <>
                    {" · "}
                    <a href={p.photo.pageUrl} target="_blank" rel="noopener noreferrer">source</a>
                  </>
                )}
              </div>
            )}
            {!p.photo && <div className="credit">No Wikimedia portrait on file. Initials stand in for a photo.</div>}
          </div>
        </div>

        <div className="stat-grid">
          <div className="kpi"><div className="l">Overall Elo</div><div className="v">{eloText(p.elo)}</div></div>
          <div className="kpi"><div className="l">Hard Elo</div><div className="v">{eloText(p.hElo)}</div></div>
          <div className="kpi"><div className="l">Clay Elo</div><div className="v">{eloText(p.cElo)}</div></div>
          <div className="kpi"><div className="l">Grass Elo</div><div className="v">{eloText(p.gElo)}</div></div>
          <div className="kpi"><div className="l">Recent W–L</div><div className="v">{formText(p.form)}</div></div>
          <div className="kpi"><div className="l">1st serve in</div><div className="v">{statPct(p.serve?.firstInPct)}</div></div>
          <div className="kpi"><div className="l">1st serve won</div><div className="v">{statPct(p.serve?.firstWonPct)}</div></div>
          <div className="kpi"><div className="l">Break pts saved</div><div className="v">{statPct(p.serve?.bpSavedPct)}</div></div>
        </div>
        <p className="note">{p.eloSource || "No Tennis Abstract Elo row for this name."} {p.serve?.source || "No serve sample."}</p>

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

        <h2 style={{ fontSize: 16, marginTop: 22 }}>Recent matches</h2>
        {!profile.recent.length ? (
          <p className="note">Tennis Abstract did not return a recent-results table for this player.</p>
        ) : (
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
