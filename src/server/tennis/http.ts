import { getDb } from "./store.ts";
import { readBoard, readPlayer, readRecord } from "./jobs.ts";

interface Req {
  query?: Record<string, string | string[] | undefined>;
}
interface Res {
  status: (code: number) => Res;
  json: (body: unknown) => void;
}

function q(req: Req, key: string): string {
  const v = req.query?.[key];
  return Array.isArray(v) ? v[0] ?? "" : v ?? "";
}

/** Public read API. Without DATABASE_URL the client falls back to the static snapshot. */
export default async function handler(req: Req, res: Res) {
  const db = await getDb();
  if (!db) {
    return res.status(200).json({
      source: "unconfigured",
      matches: [],
      notes: ["DATABASE_URL is not set. The page uses the committed snapshot when that file is present."],
    });
  }
  const view = q(req, "view") || "board";
  try {
    if (view === "record") return res.status(200).json(await readRecord(db));
    if (view === "player") {
      const id = q(req, "id");
      const player = await readPlayer(db, id);
      if (!player) return res.status(404).json({ source: "postgres", error: "player not in the book" });
      return res.status(200).json(player);
    }
    return res.status(200).json(await readBoard(db));
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "tennis read failed" });
  }
}
