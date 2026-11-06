import type { TeamCard } from "../../lib/lolesports/types";
import { fmtNum } from "../../lib/lolesports/format";
import ChampIcon from "./ChampIcon";
import GradeBadge from "./GradeBadge";

export default function DraftingPanel({ card }: { card: TeamCard }) {
  const d = card.drafting;
  const seasonRank =
    d.season_rank.rank != null && d.season_rank.of != null
      ? `${d.season_rank.rank}${ordinal(d.season_rank.rank)} of ${d.season_rank.of}`
      : "—";
  const recentRank =
    d.recent_rank.rank != null && d.recent_rank.of != null
      ? `${d.recent_rank.rank}${ordinal(d.recent_rank.rank)} of ${d.recent_rank.of}`
      : "—";
  const delta =
    d.season_rank.rank != null && d.recent_rank.rank != null
      ? d.recent_rank.rank - d.season_rank.rank
      : null;

  return (
    <div className="ascii-panel rounded-sm p-4 space-y-3 h-full">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[11px] uppercase tracking-[0.25em] phosphor">Drafting</h3>
          <p className="text-[9px] text-amber-300/80 mt-1 max-w-md">
            Proxy only — opponent-adjusted residual vs pre-map Elo. Not causal draft quality.
          </p>
        </div>
        <GradeBadge label="Drafting" grade={d.grade} />
      </div>
      <div className="grid grid-cols-2 gap-3 text-[11px]">
        <div className="border border-white/10 rounded-sm p-3 bg-black/20">
          <div className="text-[9px] uppercase tracking-wider text-ink-dim">Season</div>
          <div className="text-ink mt-1">{seasonRank}</div>
          <div className="text-[9px] text-ink-dim mt-1">
            residual {fmtNum(d.season_proxy.residual_mean, 3)} · n={d.season_proxy.n}
          </div>
        </div>
        <div className="border border-white/10 rounded-sm p-3 bg-black/20">
          <div className="text-[9px] uppercase tracking-wider text-ink-dim">
            Last {String(card.window.recent_days ?? 90)}d
            {delta != null && delta !== 0 && (
              <span className={delta > 0 ? " text-rose-300" : " text-emerald-300"}>
                {" "}
                {delta > 0 ? "↓" : "↑"}
                {Math.abs(delta)}
              </span>
            )}
          </div>
          <div className="text-ink mt-1">{recentRank}</div>
          <div className="text-[9px] text-ink-dim mt-1">
            residual {fmtNum(d.recent_proxy.residual_mean, 3)} · n={d.recent_proxy.n}
          </div>
        </div>
      </div>
      <div>
        <div className="text-[9px] uppercase tracking-wider text-ink-dim mb-2">Signature picks</div>
        {d.signature_picks.length ? (
          <div className="flex flex-wrap gap-3">
            {d.signature_picks.slice(0, 4).map((c) => (
              <div key={`${c.role}-${c.champion}`} className="flex items-center gap-2">
                <ChampIcon cdn={c.cdn} name={c.champion} size={32} />
                <div className="text-[10px]">
                  <div className="text-ink">{c.champion}</div>
                  <div className="text-ink-dim">
                    {c.w}–{c.l} · {c.role}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-ink-dim">No over-indexed signature picks in window.</p>
        )}
      </div>
      <p className="text-[10px] text-ink-dim leading-relaxed border-t border-white/5 pt-3">
        {d.analysis}
      </p>
    </div>
  );
}

function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return "th";
  switch (n % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}
