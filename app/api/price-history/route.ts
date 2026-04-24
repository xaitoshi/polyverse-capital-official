import { NextResponse } from "next/server";
import { fetchPriceHistory } from "@/lib/prices";

export const revalidate = 120;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const interval =
    (url.searchParams.get("interval") as
      | "1h"
      | "6h"
      | "1d"
      | "1w"
      | "1m"
      | "max"
      | null) ?? "1d";
  if (!token) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }
  try {
    const history = await fetchPriceHistory(token, interval);
    return NextResponse.json({ history });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 502 }
    );
  }
}
