/** Internal domain types for Polymarket Interactive Market Explorer (PRD §6). */

export type MarketKind =
  | "series_match_winner"
  | "map"
  | "handicap"
  | "futures"
  | "binary"
  | "categorical"
  | "other";

export type ResolveInputKind = "keyword" | "url" | "slug" | "preset";

export interface ResolveRequest {
  raw: string;
  kind: ResolveInputKind;
}

export interface EventConfig {
  eventId: string;
  slug: string;
  title: string;
  category?: string;
  startsAtUtc?: string;
  endsAtUtc?: string;
  canonicalUrl?: string;
}

export interface OutcomeRef {
  marketId: string;
  conditionId: string;
  tokenId: string;
  label: string;
  kind: MarketKind;
  complementaryGroupId?: string;
  outcomeIndex: number;
  /** Sibling outcomes in the same CLOB market (same conditionId). */
  marketQuestion?: string;
  marketSlug?: string;
  volumeNum?: number;
  bestBid?: number;
  bestAsk?: number;
  lastTradePrice?: number;
}

export interface ChildMarket {
  marketId: string;
  conditionId: string;
  slug: string;
  question: string;
  kind: MarketKind;
  groupItemTitle?: string;
  volumeNum?: number;
  outcomes: OutcomeRef[];
  sportsMarketType?: string | null;
}

export interface SearchHit {
  event: EventConfig;
  markets?: ChildMarket[];
  score?: number;
}

export interface PricePoint {
  ts: string; // ISO UTC
  tokenId: string;
  price: number;
  source: string;
}

export interface TradePoint {
  id: string;
  ts: string;
  tokenId: string;
  side: "BUY" | "SELL";
  price: number;
  sizeShares: number;
  notionalUsdc: number;
  wallet: string;
  walletName?: string;
  outcomeLabel?: string;
  txHash?: string;
  orderType?: "limit" | "market" | "unknown";
  liquidityRole?: "maker" | "taker" | "unknown";
}

export interface ModelFairPoint {
  ts: string;
  marketId: string;
  p: number;
  outcomeTokenId: string;
  modelVersion: string;
  source: string;
  provenanceNote?: string;
}

export interface PhaseMarker {
  id: string;
  ts: string;
  label: string;
  source: string;
}

export interface BookLevel {
  price: number;
  sizeShares: number;
}

export interface OrderBookSnapshot {
  asOf: string;
  tokenId: string;
  bids: BookLevel[];
  asks: BookLevel[];
  feeBps?: number;
  spread?: number;
  bestBid?: number;
  bestAsk?: number;
}

export interface WatchWallet {
  id: string;
  label: string;
  handle?: string;
  addresses: string[];
  identityVerification: "verified" | "unverified" | "todo";
  profileUrl?: string;
  presetGroup?: string;
}

export interface Provenance {
  asOf: string;
  sources: string[];
  completeness: "full" | "truncated" | "partial_page" | "unknown";
  warnings: string[];
  adapterVersions: Record<string, string>;
}

export interface MarketGraphPayload {
  event: EventConfig;
  market: ChildMarket;
  outcomes: OutcomeRef[];
  prices: PricePoint[];
  trades: TradePoint[];
  modelFair?: ModelFairPoint[];
  markers: PhaseMarker[];
  book?: OrderBookSnapshot[];
  watch: WatchWallet[];
  provenance: Provenance;
  mode: "live" | "fixture";
  resolvedFrom: ResolveRequest;
}

export interface ResolveResult {
  event: EventConfig;
  markets: ChildMarket[];
  provenance: Provenance;
  selectedMarketId?: string;
}

export type UrlParseOk = {
  ok: true;
  kind: "url" | "slug";
  eventSlug?: string;
  marketSlug?: string;
  rawHost?: string;
};

export type UrlParseErr = {
  ok: false;
  reason: string;
  code: "empty" | "disallowed_host" | "unsupported" | "invalid";
};

export type UrlParseResult = UrlParseOk | UrlParseErr;
