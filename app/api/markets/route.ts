import { NextResponse } from "next/server";
import { fetchTempEvents } from "@/lib/polymarket";

export const revalidate = 60;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const includeClosed = url.searchParams.get("includeClosed") !== "false";
  try {
    const markets = await fetchTempEvents({ includeClosed });
    return NextResponse.json({ markets });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 502 }
    );
  }
}
