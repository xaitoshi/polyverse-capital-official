import { ExternalLink, X } from "lucide-react";
import type { ChartTradeDatum } from "../../lib/pm-explorer/tradeSelection";
import { polygonTxUrl, polymarketProfileUrl } from "../../lib/pm-explorer/tradeSelection";
import { formatCents, formatSgt, formatUsd, shortAddr } from "../../lib/pm-explorer/format";

type Props = {
  cluster: ChartTradeDatum[];
  selectedId: string | null;
  isolateWallet: boolean;
  onSelect: (tradeId: string) => void;
  onClose: () => void;
  onToggleIsolate: () => void;
  onFocusWallet: (wallet: string | null) => void;
};

export default function TradeInspectPanel({
  cluster,
  selectedId,
  isolateWallet,
  onSelect,
  onClose,
  onToggleIsolate,
  onFocusWallet,
}: Props) {
  if (!cluster.length) return null;
  const selected = cluster.find((c) => c.tradeId === selectedId) || null;
  const multi = cluster.length > 1 && !selected;

  return (
    <section
      className="ascii-panel rounded-sm p-3"
      role="dialog"
      aria-label={multi ? "Overlapping trades — pick one" : "Selected trade"}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-ink-dim">
        <span className="phosphor">{multi ? `› ${cluster.length} overlapping trades` : "› Trade detail"}</span>
        <span className="normal-case tracking-normal text-ink-dim/80">
          Click selects · Esc closes · hover is preview only
        </span>
        <button
          type="button"
          className="ml-auto rounded-sm border border-blue-500/25 px-2 py-0.5 text-ink-dim hover:text-ink"
          onClick={onClose}
          aria-label="Close trade inspect"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {multi && (
        <ul className="mb-2 max-h-48 space-y-1 overflow-y-auto" role="listbox" aria-label="Overlapping trade cluster">
          {cluster.map((c) => (
            <li key={c.tradeId}>
              <button
                type="button"
                role="option"
                className="flex w-full flex-wrap items-center gap-2 rounded-sm border border-blue-500/15 px-2 py-1.5 text-left text-[11px] hover:bg-blue-500/10"
                onClick={() => onSelect(c.tradeId)}
              >
                <span className={c.side === "BUY" ? "text-cyan" : "text-magenta"}>
                  {c.side === "BUY" ? "▲ BUY" : "▼ SELL"}
                </span>
                <span className="text-ink">{c.outcome}</span>
                <span className="tabular-nums">{formatCents(c.price)}</span>
                <span className="tabular-nums text-ink-dim">{formatUsd(c.notional)}</span>
                <span className="font-mono text-[10px] text-ink-dim">{c.name || shortAddr(c.wallet)}</span>
                <span className="text-[10px] text-ink-dim/70">{formatSgt(c.t)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <div className="grid gap-2 text-[11px] sm:grid-cols-2">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-ink-dim">Outcome / side</div>
            <div className={selected.side === "BUY" ? "text-cyan" : "text-magenta"}>
              {selected.outcome} · {selected.side === "BUY" ? "▲ BUY" : "▼ SELL"} of this outcome token
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-ink-dim">Time (SGT)</div>
            <div>{formatSgt(selected.t, true)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-ink-dim">Price / size</div>
            <div>
              {formatCents(selected.price)} · {selected.shares.toFixed(2)} shares · {formatUsd(selected.notional)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-ink-dim">Wallet</div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="phosphor-amber">{selected.name || shortAddr(selected.wallet)}</span>
              {selected.watched && <span className="text-[10px] text-amber">watched</span>}
              <span className="font-mono text-[10px] text-ink-dim">{selected.wallet}</span>
              <a
                className="inline-flex items-center gap-1 text-blue-400 hover:underline"
                href={polymarketProfileUrl(selected.wallet)}
                target="_blank"
                rel="noopener noreferrer"
              >
                profile <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
          <div className="sm:col-span-2 flex flex-wrap gap-2">
            {polygonTxUrl(selected.tx || "") ? (
              <a
                className="inline-flex items-center gap-1 rounded-sm border border-blue-400/40 px-2 py-1 text-[10px] text-blue-400"
                href={polygonTxUrl(selected.tx || "")!}
                target="_blank"
                rel="noopener noreferrer"
              >
                Polygonscan tx <ExternalLink className="h-3 w-3" />
              </a>
            ) : (
              <span className="text-[10px] text-ink-dim">No valid tx hash on this fill — explorer link omitted.</span>
            )}
            <button
              type="button"
              className="rounded-sm border border-blue-500/25 px-2 py-1 text-[10px] text-ink-dim hover:text-ink"
              onClick={() => onFocusWallet(selected.wallet)}
            >
              Focus wallet in table
            </button>
            <button
              type="button"
              className={`rounded-sm border px-2 py-1 text-[10px] ${
                isolateWallet ? "border-amber/40 text-amber" : "border-blue-500/25 text-ink-dim"
              }`}
              onClick={onToggleIsolate}
            >
              {isolateWallet ? "Showing wallet only" : "Isolate wallet on chart"}
            </button>
            <span className="text-[10px] text-ink-dim/70">
              Role (maker/taker) unknown from this feed — not displayed.
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
