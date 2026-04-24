import { NextResponse } from "next/server";
import { fetchAsosDaily } from "@/lib/metar";

export const revalidate = 3600;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const station = url.searchParams.get("station");
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  if (!station || !start || !end) {
    return NextResponse.json(
      { error: "station, start, end required" },
      { status: 400 }
    );
  }
  try {
    const days = await fetchAsosDaily(station, start, end);
    return NextResponse.json({ days });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 502 }
    );
  }
}
