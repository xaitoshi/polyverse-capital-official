import type { TeamCard } from "../../lib/lolesports/types";
import { fmtPct } from "../../lib/lolesports/format";

const COLS = ["Blue-1st", "Blue-2nd", "Red-1st", "Red-2nd"] as const;
const ROWS = ["G1", "G2", "G3", "G4", "G5", "All"] as const;

export default function SidePickChart({ card }: { card: TeamCard }) {
  const { rows, summary } = card.side_pick_order;
  const maxN = Math.max(
    1,
    ...ROWS.flatMap((r) => COLS.map((c) => rows[r]?.[c]?.n ?? 0)),
  );

  return (
    <div className="ascii-panel rounded-sm p-4 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[11px] uppercase tracking-[0.25em] phosphor">Side & pick order</h3>
        <p className="text-[10px] text-ink-dim">
          WR Blue {fmtPct(summary.blue_wr)} · Red {fmtPct(summary.red_wr)} · 1st{" "}
          {fmtPct(summary.first_pick_wr)} · 2nd {fmtPct(summary.second_pick_wr)} · n=
          {summary.n}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[10px] border-collapse min-w-[480px]">
          <thead>
            <tr className="text-ink-dim">
              <th className="text-left py-1 pr-2 font-normal">Game</th>
              {COLS.map((c) => (
                <th key={c} className="text-left py-1 px-1 font-normal">
                  {c.replace("-", " ")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r} className="border-t border-white/5">
                <td className="py-2 pr-2 text-ink-dim">{r}</td>
                {COLS.map((c) => {
                  const cell = rows[r]?.[c];
                  const n = cell?.n ?? 0;
                  const w = cell?.w ?? 0;
                  const l = cell?.l ?? 0;
                  const width = `${Math.round((n / maxN) * 100)}%`;
                  const winShare = n ? w / n : 0;
                  return (
                    <td key={c} className="py-2 px-1">
                      <div className="space-y-1">
                        <div className="h-3 w-full bg-white/5 rounded-sm overflow-hidden border border-white/10">
                          <div
                            className="h-full flex"
                            style={{ width }}
                            title={`${w}-${l} (${n})`}
                          >
                            <div
                              className="h-full bg-emerald-400/70"
                              style={{ width: `${winShare * 100}%` }}
                            />
                            <div
                              className="h-full bg-rose-400/50"
                              style={{ width: `${(1 - winShare) * 100}%` }}
                            />
                          </div>
                        </div>
                        <div className="text-ink-dim tabular-nums">
                          {n ? `${w}–${l}` : "—"}
                        </div>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
