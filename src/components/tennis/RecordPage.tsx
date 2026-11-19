import { METHODOLOGY_SECTIONS } from "../../lib/tennis/methodology";
import { cents, edgeText, pct, recordText, roiText, whenLabel } from "../../lib/tennis/format";
import { lastName } from "../../lib/tennis/names";
import type { RecordView } from "../../lib/tennis/types";
import { Nav } from "./bits";

export default function RecordPage({ record }: { record: RecordView | null }) {
  if (!record) {
    return (
      <div className="tennis-root">
        <Nav active="record" />
        <div className="empty">
          <h1>Record unavailable</h1>
          <p>The track record file is not on this deploy, and no database is configured. Nothing here is estimated.</p>
          <p><a href="/tennis">Back to the board</a></p>
        </div>
      </div>
    );
  }
  const t = record.totals;
  const maxN = Math.max(1, ...record.calibration.map((b) => b.n));
  return (
    <div className="tennis-root">
      <Nav active="record" />
      <main className="page">
        <h1>Public track record</h1>
        <p className="note">
          Every pick stored before its match started. Settled from the Polymarket match-winner price. Voids are listed and left out of the rates. {record.inputsVersion}. Updated {record.generatedAt}.
        </p>
        <div className="stat-grid">
          <div className="kpi"><div className="l">W–L</div><div className="v">{t.settled ? recordText(t.wins, t.losses) : "—"}</div></div>
          <div className="kpi"><div className="l">Win rate</div><div className="v">{t.winRate == null ? "—" : pct(t.winRate, 1)}</div></div>
          <div className="kpi"><div className="l">Value W–L</div><div className="v">{t.valueSettled ? recordText(t.valueWins, t.valueLosses) : "—"}</div></div>
          <div className="kpi" title="Settled picks on matches that meet the skill-gap test"><div className="l">Skill-gap W–L</div><div className="v">{t.skillGapSettled ? recordText(t.skillGapWins, t.skillGapLosses) : "—"}</div></div>
          <div className="kpi"><div className="l">Skill-gap win rate</div><div className="v">{t.skillGapWinRate == null ? "—" : pct(t.skillGapWinRate, 1)}</div></div>
          <div className="kpi"><div className="l">Skill-gap ROI</div><div className="v">{roiText(t.skillGapRoi)}</div></div>
          <div className="kpi"><div className="l">Skill-gap open</div><div className="v">{t.skillGapPending ?? "—"}</div></div>
          <div className="kpi"><div className="l">Flat ROI</div><div className="v">{roiText(t.roi)}</div></div>
          <div className="kpi"><div className="l">Brier</div><div className="v">{t.brier == null ? "—" : t.brier.toFixed(3)}</div></div>
          <div className="kpi"><div className="l">Log loss</div><div className="v">{t.logLoss == null ? "—" : t.logLoss.toFixed(3)}</div></div>
          <div className="kpi"><div className="l">Voids</div><div className="v">{t.voids}</div></div>
          <div className="kpi"><div className="l">Pending</div><div className="v">{t.pending}</div></div>
        </div>
        <p className="note">Stake: {t.stake}. ROI is total pnl divided by non-void settled picks. Win pnl at price p is (1 − p) / p. A loss is −1.</p>

        <h2 style={{ fontSize: 16 }}>Calibration</h2>
        {t.settled === 0 ? (
          <div className="chart-card"><div className="wm">No settled book yet</div></div>
        ) : (
          <div className="chart-card">
            <div className="cal" aria-label="Calibration chart">
              {record.calibration.map((b) => (
                <div key={b.from} style={{ flex: 1, textAlign: "center" }}>
                  <div className="bin" style={{ height: `${Math.max(8, (b.n / maxN) * 100)}px` }} title={b.freq == null ? "empty" : `hit ${(b.freq * 100).toFixed(0)}%`}>
                    <span>{b.n ? `${Math.round((b.freq ?? 0) * 100)}%` : "—"}</span>
                  </div>
                  <div className="muted" style={{ fontSize: 10, marginTop: 4 }}>{Math.round(b.from * 100)}–{Math.round(b.to * 100)}</div>
                </div>
              ))}
            </div>
            <p className="note">Bars are the count of settled picks in each probability bin. The label is how often that side won. A calibrated book sits near the bin midpoint.</p>
          </div>
        )}

        <h2 style={{ fontSize: 16 }}>By tier</h2>
        <SliceTable rows={record.byTier} empty="No settled picks in any tier yet." />
        <h2 style={{ fontSize: 16 }}>By surface</h2>
        <SliceTable rows={record.bySurface} empty="No settled picks with a known surface yet." />

        <h2 style={{ fontSize: 16 }}>Settled picks</h2>
        <PickTable rows={record.settled} empty="None yet. Grades appear after Polymarket closes the match-winner market." />
        <h2 style={{ fontSize: 16 }}>Open picks</h2>
        <PickTable rows={record.pending} empty="No pre-start picks are waiting." />

        <section className="method">
          <h2>Methodology</h2>
          {METHODOLOGY_SECTIONS.map((s) => (
            <div key={s.heading}>
              <h2>{s.heading}</h2>
              {s.body.map((p) => <p key={p}>{p}</p>)}
            </div>
          ))}
        </section>
        <p className="note"><a href="/tennis">Back to the live board</a></p>
      </main>
    </div>
  );
}

function SliceTable({ rows, empty }: { rows: RecordView["byTier"]; empty: string }) {
  if (!rows.length) return <p className="note">{empty}</p>;
  return (
    <div className="picks-wrap">
      <table className="picks">
        <thead>
          <tr><th></th><th>W–L</th><th>Win rate</th><th>ROI</th><th>Brier</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>{r.key}</td>
              <td>{recordText(r.wins, r.losses)}</td>
              <td>{r.winRate == null ? "—" : pct(r.winRate, 1)}</td>
              <td>{roiText(r.roi)}</td>
              <td>{r.brier == null ? "—" : r.brier.toFixed(3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PickTable({ rows, empty }: { rows: RecordView["pending"]; empty: string }) {
  if (!rows.length) return <p className="note">{empty}</p>;
  return (
    <div className="picks-wrap">
      <table className="picks">
        <thead>
          <tr>
            <th>Picked</th><th>Start</th><th>Match</th><th>Pick</th><th>Model</th><th>Price</th><th>Edge</th><th>Result</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.matchId}>
              <td className="muted">{whenLabel(r.pick.pickedAt)}</td>
              <td className="muted">{whenLabel(r.startTime)}</td>
              <td>{r.tier} · {r.tournament} · {lastName(r.playerA)} vs {lastName(r.playerB)}</td>
              <td>{lastName(r.pick.playerName)}{r.pick.value ? <span className="tag-v">VALUE</span> : null}</td>
              <td>{pct(r.pick.modelProb, 1)} <span className="muted">{r.pick.confidence}</span></td>
              <td>{cents(r.pick.marketPrice)}</td>
              <td>{edgeText(r.pick.edgePp)}</td>
              <td className="muted">
                {r.result?.kind === "void" ? "Void" : r.result?.pickWon == null ? "Open" : r.result.pickWon ? "Won" : "Lost"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
