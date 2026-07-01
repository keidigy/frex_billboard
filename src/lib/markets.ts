import { dbGet, dbRun, nowIso } from "@/lib/db";
import { providers } from "@/lib/market/providers";
import type { Currency, PricePoint, SymbolSearchResult } from "@/lib/types";

async function debugFailureEnabled(provider: string) {
  const row = await dbGet<{ value: string }>("SELECT value FROM debug_state WHERE key = ?", [`fail.${provider}`]);
  return row?.value === "1";
}

function dedupe(results: SymbolSearchResult[]) {
  const map = new Map<string, SymbolSearchResult>();
  for (const result of results) {
    if (!map.has(result.symbol)) map.set(result.symbol, result);
  }
  return [...map.values()];
}

export async function searchSymbols(query: string) {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const results: SymbolSearchResult[] = [];
  for (const provider of providers) {
    if (await debugFailureEnabled(provider.name)) continue;
    try {
      results.push(...(await provider.searchSymbols(trimmed)));
    } catch {
      // Fallback provider handles provider-specific outages.
    }
  }
  return dedupe(results).slice(0, 12);
}

export async function latestClose(symbol: string) {
  const errors: string[] = [];
  for (const provider of providers) {
    if (await debugFailureEnabled(provider.name)) {
      errors.push(`${provider.name}: debug failure`);
      continue;
    }
    try {
      const latest = await provider.getLatestClose(symbol);
      return { ...latest, provider: provider.name };
    } catch (error) {
      errors.push(`${provider.name}: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }
  throw new Error(errors.join(" | "));
}

export async function historicalCloses(symbol: string, from: Date, to: Date) {
  const errors: string[] = [];
  for (const provider of providers) {
    if (await debugFailureEnabled(provider.name)) {
      errors.push(`${provider.name}: debug failure`);
      continue;
    }
    try {
      const points = await provider.getHistoricalCloses(symbol, from, to);
      if (points.length > 0) return { points, provider: provider.name };
    } catch (error) {
      errors.push(`${provider.name}: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }
  throw new Error(errors.join(" | "));
}

export async function insertPriceSnapshot(entryId: string, price: number, provider: string, capturedAt = nowIso()) {
  await dbRun(
    `INSERT INTO price_snapshots (id, league_entry_id, captured_at, price, provider)
     VALUES (?, ?, ?, ?, ?)`,
    [crypto.randomUUID(), entryId, capturedAt, price, provider]
  );
}

export function currencyFromSearch(value: FormDataEntryValue | null): Currency {
  return value === "KRW" ? "KRW" : "USD";
}

export function normalizeHistorical(points: PricePoint[], startPrice: number) {
  if (points.length === 0) return [];
  return points.map((point) => ({
    date: point.date,
    close: ((point.close - startPrice) / startPrice) * 100,
  }));
}
