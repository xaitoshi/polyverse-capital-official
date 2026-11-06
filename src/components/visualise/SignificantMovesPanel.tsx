import type { SignificantMove } from "../../lib/pm-explorer/significantMoves";
import type { MoveWindowKey } from "../../lib/pm-explorer/significantMoves";
import { formatCents, formatSgt, formatUsd, shortAddr } from "../../lib/pm-explorer/format";

type Props = {
  moves: SignificantMove[];
  windowKey: MoveWindowKey;
  onWindowKey: (k: MoveWindowKey) => void;
  selectedMoveId: string | null;
  onSelectMove: (id: string | null) => void;
  onSelectTradeId: (tradeId: string) => void;
  primaryLabel: string;
};

export default function SignificantMovesPanel({
  moves,
  windowKey,
  onWindowKey,
  selectedMoveId,
  onSelectMove,
  onSelectTradeId,
  primaryLabel,
}: Props) {
  return (
    <section className="ascii-panel rounded-sm p-3" aria-label="Significant price moves">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-[0.22em] text-ink-dim">
          › Significant moves · {primaryLabel}
        </span>
        <span className="normal-case tracking-normal text-[10px] text-ink-dim/80">
          Ranked by |Δpp| on price ticks · associated fills are overlaps only · no verified catalyst feed
        </span>
        <div className="ml-auto flex gap-1">
          {(["5m", "15m", "60m"] as MoveWindowKey[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => onWindowKey(k)}
              className={`rounded-sm border px-2 py-0.5 text-[10px] uppercase ${
                windowKey === k ? "border-blue-400/50 text-blue-400" : "border-blue-500/15 text-ink-dim"
              }`}
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      {!moves.length ? (
        <p className="text-[11px] text-ink-dim">
          No moves above the adaptive |pp| threshold for this window given current tick resolution.
        </p>
      ) : (
        <ol className="grid gap-2 lg:grid-cols-2">
          {moves.map((m, idx) => {
            const active = selectedMoveId === m.id;
            return (
              <li
                key={m.id}
                className={`rounded-sm border p-2 text-[11px] ${
                  active ? "border-amber/50 bg-amber/5" : "border-blue-500/15"
                }`}
              >
                <button
                  type="button"
                  className="mb-1 flex w-full flex-wrap items-baseline gap-2 text-left"
                  onClick={() => onSelectMove(active ? null : m.id)}
                >
                  <span className="phosphor text-[10px]">#{idx + 1}</span>
                  <span className={m.direction === "up" ? "text-cyan" : "text-magenta"}>
                    {m.direction === "up" ? "▲" : "▼"} {m.absPp.toFixed(1)}pp
                  </span>
                  <span className="tabular-nums text-ink">
                    {formatCents(m.startPrice)} → {formatCents(m.endPrice)}
                  </span>
                  <span className="text-[10px] text-ink-dim">
                    {formatSgt(m.startMs)} → {formatSgt(m.endMs)}
                  </span>
                  <span className="text-[10px] text-ink-dim">
                    {m.tickCountInSpan} ticks · span {Math.round(m.observedSpanMs / 60_000)}m
                  </span>
                </button>
                <div className="mb-1 text-[10px] text-ink-dim">
                  During window: {m.tradeCount} fills · buy {formatUsd(m.buyNotional)} / sell{" "}
                  {formatUsd(m.sellNotional)} · coverage <span className="text-ink">{m.coverage.status}</span> ·
                  persistence <span className="text-ink">{m.persistence.kind}</span>
                </div>
                <p className="mb-1 text-[10px] text-amber/90">{m.coverage.note}</p>
                <p className="mb-2 text-[10px] text-ink-dim">{m.persistence.note}</p>
                {m.largestTrades.length > 0 ? (
                  <div>
                    <div className="mb-1 text-[10px] uppercase tracking-wider text-ink-dim">
                      Largest associated fills (click to inspect)
                    </div>
                    <ul className="space-y-0.5">
                      {m.largestTrades.map((a) => (
                        <li key={a.trade.id}>
                          <button
                            type="button"
                            className="flex w-full flex-wrap gap-2 rounded-sm border border-transparent px-1 py-0.5 text-left hover:border-blue-400/30 hover:bg-blue-500/5"
                            onClick={() => onSelectTradeId(a.trade.id)}
                          >
                            <span className="text-[10px] text-ink-dim">{a.relation}</span>
                            <span className={a.trade.side === "BUY" ? "text-cyan" : "text-magenta"}>
                              {a.trade.side}
                            </span>
                            <span>{formatUsd(a.trade.notionalUsdc)}</span>
                            <span className="font-mono text-[10px] text-ink-dim">
                              {a.trade.walletName || shortAddr(a.trade.wallet)}
                            </span>
                            <span className="text-[10px] text-ink-dim">{formatSgt(a.trade.ts)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="text-[10px] text-ink-dim">No overlapping fills in the loaded sample for this window.</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
