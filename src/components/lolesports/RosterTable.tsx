import type { RosterPlayer } from "../../lib/lolesports/types";
import { fmtNum, fmtSigned } from "../../lib/lolesports/format";
import ChampIcon from "./ChampIcon";
import StatBar from "./StatBar";

function Tri({ kind }: { kind: "strength" | "weakness" }) {
  return (
    <span
      className={`inline-block w-0 h-0 border-l-[4px] border-r-[4px] border-l-transparent border-r-transparent mr-1 ${
        kind === "strength"
          ? "border-b-[6px] border-b-emerald-400"
          : "border-t-[6px] border-t-rose-400"
      }`}
      aria-hidden
    />
  );
}

export default function RosterTable({ roster }: { roster: RosterPlayer[] }) {
  if (!roster.length) {
    return (
      <div className="ascii-panel rounded-sm p-4 text-[11px] text-ink-dim">
        No player rows meet the minimum sample for this window.
      </div>
    );
  }

  return (
    <div className="ascii-panel rounded-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-2">
        <h3 className="text-[11px] uppercase tracking-[0.25em] phosphor">Player performance</h3>
        <span className="text-[9px] text-ink-dim">Role peers · shrinkage · confidence shown</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] min-w-[860px]">
          <thead>
            <tr className="text-[9px] uppercase tracking-[0.15em] text-ink-dim border-b border-white/5">
              <th className="text-left font-normal px-4 py-2">Role / player</th>
              <th className="text-left font-normal px-2 py-2">Rating</th>
              <th className="text-left font-normal px-2 py-2">Laning</th>
              <th className="text-left font-normal px-2 py-2">GD@15 pct</th>
              <th className="text-left font-normal px-2 py-2">G / KDA / Pool</th>
              <th className="text-left font-normal px-4 py-2">Strengths / weaknesses</th>
            </tr>
          </thead>
          <tbody>
            {roster.map((p) => (
              <tr key={`${p.role}-${p.player}`} className="border-t border-white/5 align-top">
                <td className="px-4 py-3">
                  <div className="font-medium text-ink">{p.player}</div>
                  <div className="text-[9px] text-ink-dim uppercase tracking-wider mt-0.5">
                    {p.role_label} · {p.confidence}
                  </div>
                  <div className="flex gap-1 mt-2">
                    {p.most_played.map((c) => (
                      <ChampIcon key={c.champion} cdn={c.cdn} name={c.champion} size={24} />
                    ))}
                  </div>
                </td>
                <td className="px-2 py-3">
                  <StatBar value={p.rating} tone="cyan" label="Player rating" />
                </td>
                <td className="px-2 py-3">
                  <StatBar value={p.laning} tone="green" label="Laning" />
                </td>
                <td className="px-2 py-3">
                  <div className="space-y-1">
                    <StatBar value={p.gd15_pct} tone="amber" label="GD@15 percentile" />
                    <div className="text-[9px] text-ink-dim">{fmtSigned(p.gd15, 0)} gold</div>
                  </div>
                </td>
                <td className="px-2 py-3 tabular-nums text-ink-dim">
                  <div>{p.games}</div>
                  <div>{fmtNum(p.kda, 2)} KDA</div>
                  <div>pool {p.pool}</div>
                </td>
                <td className="px-4 py-3">
                  <ul className="space-y-1 text-[10px]">
                    {p.strengths.map((s) => (
                      <li key={`s-${s.metric}`} className="text-emerald-300/90">
                        <Tri kind="strength" />
                        {s.label} ({s.percentile})
                      </li>
                    ))}
                    {p.weaknesses.map((s) => (
                      <li key={`w-${s.metric}`} className="text-rose-300/90">
                        <Tri kind="weakness" />
                        {s.label} ({s.percentile})
                      </li>
                    ))}
                    {!p.strengths.length && !p.weaknesses.length && (
                      <li className="text-ink-dim">No extreme peer outliers</li>
                    )}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
