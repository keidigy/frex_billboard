export type FinalPrice = {
  price: number;
  provider: string;
  at: string;
};

export type FinalizableEntryState = {
  early_confirmed: number;
  early_confirm_price: number | null;
  end_price: number | null;
  ranking_price: number | null;
  current_price: number | null;
  provider: string | null;
  last_price_at: string | null;
  ended_at: string | null;
};

export type FinalizationPatch = {
  endPrice: number | null;
  rankingPrice: number;
  currentPrice: number;
  provider: string;
  lastPriceAt: string;
  endedAt: string;
  manualPriceRequired: number;
  snapshot: FinalPrice | null;
};

export function pickFinalClose(points: Array<{ date: string; close: number }>, endsAt: string) {
  return points
    .filter((point) => point.date <= endsAt && Number.isFinite(point.close))
    .sort((a, b) => a.date.localeCompare(b.date))
    .at(-1);
}

export function buildFinalizationPatch(
  entry: FinalizableEntryState,
  leagueEndsAt: string,
  finalPrice: FinalPrice | null
): FinalizationPatch | null {
  const fixedPrice = entry.ranking_price ?? (entry.early_confirmed ? entry.early_confirm_price : entry.end_price);

  if (fixedPrice != null) {
    if (entry.ended_at === leagueEndsAt) return null;
    return {
      endPrice: null,
      rankingPrice: fixedPrice,
      currentPrice: entry.current_price ?? fixedPrice,
      provider: entry.provider ?? "fixed-ranking-price",
      lastPriceAt: entry.last_price_at ?? leagueEndsAt,
      endedAt: leagueEndsAt,
      manualPriceRequired: 0,
      snapshot: null,
    };
  }

  if (!finalPrice) return null;

  return {
    endPrice: finalPrice.price,
    rankingPrice: finalPrice.price,
    currentPrice: finalPrice.price,
    provider: finalPrice.provider,
    lastPriceAt: finalPrice.at,
    endedAt: leagueEndsAt,
    manualPriceRequired: 0,
    snapshot: finalPrice,
  };
}
