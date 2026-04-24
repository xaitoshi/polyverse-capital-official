import { NextResponse } from "next/server";
import { fetchOpenMeteo } from "@/lib/forecasts";

export const revalidate = 600;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const lat = Number(url.searchParams.get("lat"));
  const lon = Number(url.searchParams.get("lon"));
  const cc = url.searchParams.get("cc") || undefined;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json(
      { error: "lat/lon required" },
      { status: 400 }
    );
  }
  try {
    const models = await fetchOpenMeteo(lat, lon, cc);
    return NextResponse.json({ models });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 502 }
    );
  }
}
