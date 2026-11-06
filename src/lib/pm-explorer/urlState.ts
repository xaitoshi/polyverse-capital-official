import type { ClobInterval } from "./adapters/clobPricesV1";

export type VisualiseQueryState = {
  q: string;
  event: string;
  market: string;
  interval: ClobInterval;
  wallets: string;
};

const INTERVALS = new Set(["1h", "6h", "1d", "1w", "1m", "max"]);

export function parseVisualiseSearchParams(
  search: string | URLSearchParams
): VisualiseQueryState {
  const sp = typeof search === "string" ? new URLSearchParams(search.replace(/^\?/, "")) : search;
  const intervalRaw = sp.get("interval") || "1w";
  const interval = (INTERVALS.has(intervalRaw) ? intervalRaw : "1w") as ClobInterval;
  return {
    q: sp.get("q") || "",
    event: sp.get("event") || "",
    market: sp.get("market") || "",
    interval,
    wallets: sp.get("wallets") || "",
  };
}

/** Build shareable query string (no leading ?). */
export function buildVisualiseSearchParams(state: Partial<VisualiseQueryState>): string {
  const sp = new URLSearchParams();
  if (state.q) sp.set("q", state.q);
  if (state.event) sp.set("event", state.event);
  if (state.market) sp.set("market", state.market);
  if (state.interval) sp.set("interval", state.interval);
  if (state.wallets) sp.set("wallets", state.wallets);
  return sp.toString();
}
