import type { TradePoint, WatchWallet } from "../../lib/pm-explorer/types";
import { formatCents, formatSgt, formatUsd, shortAddr } from "../../lib/pm-explorer/format";

type Agg = {
  wallet: string;
  name?: string;
  watched?: WatchWallet;
  trades: number;
  boughtUsdc: number;
  soldUsdc: number;
  lastTs: string;
  lastPrice: number;
  lastSide: "BUY" | "SELL";
};

function aggregate(trades: TradePoint[], watch: WatchWallet[]): Agg[] {
  const watchByAddr = new Map<string, WatchWallet>();
  for (const w of watch) {
    for (const a of w.addresses) watchByAddr.set(a.toLowerCase(), w);
  }
  const map = new Map<string, Agg>();
  for (const t of trades) {
    const key = t.wallet.toLowerCase();
    let row = map.get(key);
    if (!row) {
      row = {
        wallet: key,
        name: t.walletName,
        watched: watchByAddr.get(key),
        trades: 0,
        boughtUsdc: 0,
        soldUsdc: 0,
        lastTs: t.ts,
        lastPrice: t.price,
        lastSide: t.side,
      };
      map.set(key, row);
    }
    row.trades += 1;
    if (t.side === "BUY") row.boughtUsdc += t.notionalUsdc;
    else row.soldUsdc += t.notionalUsdc;
    if (t.ts >= row.lastTs) {
      row.lastTs = t.ts;
      row.lastPrice = t.price;
      row.lastSide = t.side;
      if (t.walletName) row.name = t.walletName;
    }
  }
  return [...map.values()].sort(
    (a, b) => b.boughtUsdc + b.soldUsdc - (a.boughtUsdc + a.soldUsdc)
  );
}

type Props = {
  trades: TradePoint[];
  watch: WatchWallet[];
  asOf?: string;
  focusedWallet?: string | null;
  onFocusWallet?: (wallet: string | null) => void;
};

export default function WalletTable({
  trades,
  watch,
  asOf,
  focusedWallet,
  onFocusWallet,
}: Props) {
  const rows = aggregate(trades, watch);

  if (!trades.length) {
    return (
      <div className="ascii-panel rounded-sm p-4 text-[11px] text-ink-dim">
        No trades in the loaded window. Sparse markets show price lines only — no fake bubbles.
      </div>
    );
  }

  return (
    <div className="ascii-panel rounded-sm overflow-hidden">
      <div className="ascii-panel-heading px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-ink-dim flex items-center justify-between gap-3">
        <span>
          › Active wallets <span className="phosphor">{rows.length}</span>
          {watch.length === 0 && (
            <span className="ml-2 normal-case tracking-normal text-ink-dim/70">
              — no watched wallets; showing all trades equally
            </span>
          )}
        </span>
        <span className="normal-case tracking-normal">
          P&amp;L scoped to loaded fills only · asOf {asOf ? formatSgt(asOf) : "—"}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-[11px]">
          <thead className="text-[10px] uppercase tracking-[0.18em] text-ink-dim border-b border-blue-500/15">
            <tr>
              <th className="px-3 py-2 font-medium">Wallet</th>
              <th className="px-3 py-2 font-medium">Watched</th>
              <th className="px-3 py-2 font-medium">Trades</th>
              <th className="px-3 py-2 font-medium">Bought USDC</th>
              <th className="px-3 py-2 font-medium">Sold USDC</th>
              <th className="px-3 py-2 font-medium">Last</th>
              <th className="px-3 py-2 font-medium">Side</th>
              <th className="px-3 py-2 font-medium">Links</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 80).map((r) => {
              const focused = focusedWallet === r.wallet;
              return (
                <tr
                  key={r.wallet}
                  className={`border-b border-blue-500/10 hover:bg-blue-500/5 cursor-pointer ${
                    focused ? "bg-blue-500/10" : ""
                  }`}
                  onClick={() => onFocusWallet?.(focused ? null : r.wallet)}
                >
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="text-ink">{r.name || shortAddr(r.wallet)}</div>
                    <div className="text-[10px] text-ink-dim font-mono">{shortAddr(r.wallet)}</div>
                  </td>
                  <td className="px-3 py-2">
                    {r.watched ? (
                      <span className="phosphor-amber text-[10px] uppercase tracking-wider">
                        {r.watched.label}
                      </span>
                    ) : (
                      <span className="text-ink-dim/50">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{r.trades}</td>
                  <td className="px-3 py-2 tabular-nums text-cyan">{formatUsd(r.boughtUsdc)}</td>
                  <td className="px-3 py-2 tabular-nums text-magenta">{formatUsd(r.soldUsdc)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div>{formatSgt(r.lastTs)}</div>
                    <div className="text-ink-dim">{formatCents(r.lastPrice)}</div>
                  </td>
                  <td className="px-3 py-2">
                    <span className={r.lastSide === "BUY" ? "text-cyan" : "text-magenta"}>
                      {r.lastSide === "BUY" ? "▲ BUY" : "▼ SELL"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <a
                      className="text-blue-400 hover:underline"
                      href={`https://polymarket.com/profile/${r.wallet}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      profile
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
