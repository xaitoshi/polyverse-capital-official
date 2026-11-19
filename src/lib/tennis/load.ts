import type { BoardView, PlayerProfile, RecordView } from "./types";

async function fromApi<T>(url: string, accept: (data: T) => boolean): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as T;
    return accept(data) ? data : null;
  } catch {
    return null;
  }
}

export async function loadBoard(): Promise<BoardView> {
  const live = await fromApi<BoardView>("/api/tennis?view=board", (d) => d?.source === "postgres");
  if (live) return live;
  const res = await fetch("/data/tennis/board.json");
  if (!res.ok) {
    return {
      generatedAt: new Date().toISOString(),
      inputsVersion: "polyverse-tennis-v1",
      source: "unconfigured",
      matches: [],
      record: {
        settled: 0, wins: 0, losses: 0, voids: 0, pending: 0,
        winRate: null, valueWins: 0, valueLosses: 0, valueSettled: 0,
        skillGapWins: 0, skillGapLosses: 0, skillGapSettled: 0,
        skillGapWinRate: null, skillGapRoi: null, skillGapPending: 0,
        roi: null, brier: null, logLoss: null,
        stake: "flat 1u at the pick-time price",
      },
      sources: {},
      notes: ["No DATABASE_URL and no snapshot file. The book is empty until ingest runs."],
    };
  }
  return (await res.json()) as BoardView;
}

export async function loadRecord(): Promise<RecordView | null> {
  const live = await fromApi<RecordView & { source?: string }>(
    "/api/tennis?view=record",
    (d) => d?.source === "postgres" && Boolean(d.totals),
  );
  if (live) return live;
  const res = await fetch("/data/tennis/record.json");
  if (!res.ok) return null;
  return (await res.json()) as RecordView;
}

export async function loadPlayer(id: string): Promise<PlayerProfile | null> {
  try {
    const res = await fetch(`/api/tennis?view=player&id=${encodeURIComponent(id)}`);
    if (res.status === 404) {
      const body = (await res.json().catch(() => null)) as { source?: string } | null;
      if (body?.source === "postgres") return null;
    } else if (res.ok) {
      const data = (await res.json()) as PlayerProfile & { source?: string };
      if (data?.source === "postgres" && data.player) return data;
    }
  } catch {
    /* snapshot */
  }
  const res = await fetch(`/data/tennis/players/${encodeURIComponent(id)}.json`);
  if (!res.ok) return null;
  return (await res.json()) as PlayerProfile;
}
