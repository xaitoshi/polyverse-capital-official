import type { Tier } from "./types";

export type TourFilter = Tier | "all";

const TOURS: TourFilter[] = ["atp", "wta", "challenger", "itf"];

export interface TennisFilters {
  tour: TourFilter;
  value: boolean;
  skillGap: boolean;
}

export function readTennisFilters(search: string): TennisFilters {
  const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const raw = q.get("tour");
  const tour = TOURS.includes(raw as TourFilter) ? (raw as TourFilter) : "all";
  return {
    tour,
    value: q.get("value") === "1",
    skillGap: q.get("skillGap") === "1",
  };
}

/** Keep unrelated query params. Omit defaults so a plain /tennis link stays clean. */
export function writeTennisFilters(currentSearch: string, filters: TennisFilters): string {
  const q = new URLSearchParams(currentSearch.startsWith("?") ? currentSearch.slice(1) : currentSearch);
  if (filters.tour === "all") q.delete("tour");
  else q.set("tour", filters.tour);
  if (filters.value) q.set("value", "1");
  else q.delete("value");
  if (filters.skillGap) q.set("skillGap", "1");
  else q.delete("skillGap");
  const s = q.toString();
  return s ? `?${s}` : "";
}
