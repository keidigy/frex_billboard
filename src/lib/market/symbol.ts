export function canonicalMarketSymbol(symbol: string, market: string) {
  const normalized = symbol.trim().toUpperCase();
  if (market !== "KR") return normalized;

  const withoutKoreanSuffix = normalized.replace(/\.(KS|KQ)$/i, "");
  return /^\d{1,6}$/.test(withoutKoreanSuffix) ? withoutKoreanSuffix.padStart(6, "0") : withoutKoreanSuffix;
}
