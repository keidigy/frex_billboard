export type PortfolioReturnSegment = {
  leagueType: string;
  startsAt: string;
  factor: number;
};

export function calculateRebalancedPortfolioIndex(segments: PortfolioReturnSegment[], baseValue = 1000) {
  const byType = new Map<string, PortfolioReturnSegment[]>();

  for (const segment of segments) {
    const factor = Number.isFinite(segment.factor) && segment.factor > 0 ? segment.factor : 1;
    const current = byType.get(segment.leagueType) ?? [];
    current.push({ ...segment, factor });
    byType.set(segment.leagueType, current);
  }

  const typeValues = [...byType.values()].map((items) => {
    return items
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .reduce((value, item) => value * item.factor, baseValue);
  });

  if (typeValues.length === 0) return baseValue;
  return typeValues.reduce((sum, value) => sum + value, 0) / typeValues.length;
}
