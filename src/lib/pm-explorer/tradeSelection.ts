import type { TradePoint } from "./types";

export type ChartTradeDatum = {
  tradeId: string;
  t: number;
  price: number;
  z: number;
  side: "BUY" | "SELL";
  notional: number;
  shares: number;
  wallet: string;
  name?: string;
  watched: boolean;
  outcome: string;
  tokenId: string;
  tx?: string;
  color: string;
  opacity: number;
};

/** Polygonscan-style hash: 0x + 64 hex. */
export function isValidTxHash(tx: string | undefined | null): boolean {
  if (!tx) return false;
  return /^0x[a-fA-F0-9]{64}$/.test(tx.trim());
}

export function polygonTxUrl(tx: string): string | null {
  if (!isValidTxHash(tx)) return null;
  return `https://polygonscan.com/tx/${tx.trim()}`;
}

export function polymarketProfileUrl(wallet: string): string {
  return `https://polymarket.com/profile/${wallet.toLowerCase()}`;
}

/**
 * Cluster trades that share (nearly) the same chart coordinates.
 * Uses time+price proximity in data space so overlapping icons are selectable.
 */
export function clusterOverlappingTrades(
  points: ChartTradeDatum[],
  target: ChartTradeDatum,
  opts?: { timeMs?: number; priceEps?: number }
): ChartTradeDatum[] {
  const timeMs = opts?.timeMs ?? 90_000; // 90s — typical for stacked icons on sparse charts
  const priceEps = opts?.priceEps ?? 0.008; // 0.8¢
  return points
    .filter(
      (p) =>
        p.tokenId === target.tokenId &&
        Math.abs(p.t - target.t) <= timeMs &&
        Math.abs(p.price - target.price) <= priceEps
    )
    .sort((a, b) => b.notional - a.notional || a.t - b.t);
}

export function tradePointToChartDatum(
  tr: TradePoint,
  outcomeLabel: string,
  watched: boolean,
  watchActive: boolean
): ChartTradeDatum {
  return {
    tradeId: tr.id,
    t: Date.parse(tr.ts),
    price: tr.price,
    z: Math.max(3, Math.min(28, 2.2 * Math.sqrt(Math.max(0, tr.notionalUsdc)))),
    side: tr.side,
    notional: tr.notionalUsdc,
    shares: tr.sizeShares,
    wallet: tr.wallet,
    name: tr.walletName,
    watched,
    outcome: outcomeLabel,
    tokenId: tr.tokenId,
    tx: tr.txHash,
    color: tr.side === "BUY" ? "#5ef1ff" : "#ff5ecc",
    opacity: watched || !watchActive ? 0.9 : 0.35,
  };
}

export type TradeInspectState = {
  selectedId: string | null;
  cluster: ChartTradeDatum[];
  isolateWallet: boolean;
};

export function selectTradeFromClick(
  points: ChartTradeDatum[],
  clicked: ChartTradeDatum
): TradeInspectState {
  const cluster = clusterOverlappingTrades(points, clicked);
  const selectedId = cluster.length === 1 ? cluster[0]!.tradeId : null;
  return { selectedId, cluster, isolateWallet: false };
}

export function pickFromCluster(
  state: TradeInspectState,
  tradeId: string
): TradeInspectState {
  if (!state.cluster.some((c) => c.tradeId === tradeId)) return state;
  return { ...state, selectedId: tradeId };
}

export function clearTradeInspect(): TradeInspectState {
  return { selectedId: null, cluster: [], isolateWallet: false };
}
