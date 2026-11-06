import type { TeamCard } from "../../lib/lolesports/types";
import ChampIcon from "./ChampIcon";

export default function OffMetaPanel({ card }: { card: TeamCard }) {
  const defn = card.off_meta_definition as {
    rule?: string;
    ringed?: string;
    fearless?: string;
    off_role_separate?: string;
    threshold?: number;
    version?: string;
    window?: { eligible_n?: number; date_start?: string; date_end?: string };
  };

  return (
    <div className="ascii-panel rounded-sm p-4 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[11px] uppercase tracking-[0.25em] phosphor">
          Off-meta picks by player
        </h3>
        <p className="text-[9px] text-ink-dim max-w-3xl">
          {defn.rule || "Pick+ban presence classifier"}
          {defn.window?.eligible_n != null && (
            <> · window N={defn.window.eligible_n}</>
          )}
        </p>
      </div>
      {(defn.fearless || defn.off_role_separate) && (
        <p className="text-[9px] text-amber-200/80 leading-relaxed">
          {[defn.fearless, defn.off_role_separate, defn.ringed].filter(Boolean).join(" ")}
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {card.roster.map((p) => (
          <div key={p.player} className="border border-white/10 rounded-sm p-3 bg-black/20">
            <div className="text-[10px] uppercase tracking-wider text-ink-dim">{p.role_label}</div>
            <div className="text-[12px] text-ink mb-2">{p.player}</div>
            {p.off_meta?.length ? (
              <ul className="space-y-2">
                {p.off_meta.slice(0, 5).map((c) => (
                  <li key={c.champion} className="text-[10px]">
                    <div className="flex items-center gap-2">
                      <ChampIcon cdn={c.cdn} name={c.champion} ringed={c.ringed} size={26} />
                      <span className="text-ink">{c.champion}</span>
                      <span className="text-ink-dim ml-auto tabular-nums">
                        {c.w}–{c.l}
                      </span>
                    </div>
                    <div className="mt-0.5 pl-8 text-[9px] text-ink-dim leading-snug">
                      {c.pb_pct != null ? `PB ${c.pb_pct}%` : "PB —"}
                      {c.pick_maps != null && c.ban_maps != null && (
                        <> · P{c.pick_maps}/B{c.ban_maps}</>
                      )}
                      {c.eligible_n != null && <> · N={c.eligible_n}</>}
                      {c.label && <> · {c.label}</>}
                      {c.off_role?.off_role === true && (
                        <> · off-role vs {c.off_role.modal_role}</>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[10px] text-ink-dim">None classified off-meta in window</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
