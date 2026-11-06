import type { TierFilter } from "./types";

export interface LolesportsUrlState {
  team?: string;
  q?: string;
  tier: TierFilter;
  method?: boolean;
}

export function parseLolesportsSearchParams(search: string): LolesportsUrlState {
  const sp = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  const tierRaw = sp.get("tier") || "all";
  const tier: TierFilter =
    tierRaw === "majors" || tierRaw === "academy_erl" || tierRaw === "all"
      ? tierRaw
      : "all";
  return {
    team: sp.get("team") || undefined,
    q: sp.get("q") || undefined,
    tier,
    method: sp.get("method") === "1",
  };
}

export function writeLolesportsQuery(next: Record<string, string | undefined>) {
  const sp = new URLSearchParams(window.location.search);
  for (const [k, v] of Object.entries(next)) {
    if (!v) sp.delete(k);
    else sp.set(k, v);
  }
  const qs = sp.toString();
  window.history.replaceState({}, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
}
