import { NextResponse } from "next/server";
import { searchSymbols } from "@/lib/markets";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? "";
  try {
    const results = await searchSymbols(query);
    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json(
      { results: [], error: error instanceof Error ? error.message : "search failed" },
      { status: 500 }
    );
  }
}
