import { NextResponse } from "next/server";
import { fetchSameDayAcrossYears } from "@/lib/metar";

// Same-calendar-day climatology from METAR, built for "what has this date
// actually done historically?" context alongside the forecast.
export const revalidate = 86400; // 1 day

export async function GET(req: Request) {
  const url = new URL(req.url);
  const station = url.searchParams.get("station");
  const date = url.searchParams.get("date"); // YYYY-MM-DD
  const yearCount = Number(url.searchParams.get("years") || 5);

  if (!station || !date) {
    return NextResponse.json(
      { error: "station and date required" },
      { status: 400 }
    );
  }

  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) {
    return NextResponse.json({ error: "bad date" }, { status: 400 });
  }

  // Walk backward from the year before the target (so the current year isn't
  // partially filled with unreliable preliminary data).
  const years = Array.from({ length: yearCount }, (_, i) => y - 1 - i);

  try {
    const records = await fetchSameDayAcrossYears(station, m, d, years);
    return NextResponse.json({ records });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 502 }
    );
  }
}
