import { cronAuthorized } from "./tennisStore.ts";
import { runJob } from "./tennisJobs.ts";

interface Req {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
}
interface Res {
  status: (code: number) => Res;
  json: (body: unknown) => void;
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "method" });
  if (!cronAuthorized(req.headers?.authorization)) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const raw = req.query?.job;
  const job = (Array.isArray(raw) ? raw[0] : raw) || "all";
  if (job !== "ingest" && job !== "picks" && job !== "settle" && job !== "all") {
    return res.status(400).json({ error: "job must be ingest, picks, settle, or all" });
  }
  try {
    return res.status(200).json(await runJob(job));
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "cron failed" });
  }
}
