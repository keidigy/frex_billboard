import { NextResponse } from "next/server";
import { captureDailyPriceSnapshots } from "@/lib/daily-prices";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET is not configured" }, { status: 500 });
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const result = await captureDailyPriceSnapshots();
  return NextResponse.json({ ok: true, ...result });
}
