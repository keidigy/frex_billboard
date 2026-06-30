import { getAllLeagues, getRankedEntriesForLeague } from "@/lib/leagues";

export type HistoricalRankingMode = "medal" | "score";

export type HistoricalRankingRow = {
  userId: string;
  realName: string;
  rank: number;
  score: number;
  placements: number[];
  firsts: number;
  seconds: number;
  thirds: number;
};

function baseScore(rank: number) {
  return Math.max(10 - rank, 1);
}

function leagueWeight(type: string) {
  if (type === "L") return 6;
  if (type === "M") return 3;
  return 1;
}

export function getHistoricalRankings(mode: HistoricalRankingMode) {
  const leagues = getAllLeagues();
  const byUser = new Map<string, HistoricalRankingRow>();

  for (const league of leagues) {
    const ranked = getRankedEntriesForLeague(league.id);
    for (const entry of ranked) {
      const existing =
        byUser.get(entry.user_id) ??
        ({
          userId: entry.user_id,
          realName: entry.real_name,
          rank: 0,
          score: 0,
          placements: [],
          firsts: 0,
          seconds: 0,
          thirds: 0,
        } satisfies HistoricalRankingRow);

      existing.placements[entry.rank] = (existing.placements[entry.rank] ?? 0) + 1;
      existing.score += baseScore(entry.rank) * leagueWeight(league.league_type);
      existing.firsts = existing.placements[1] ?? 0;
      existing.seconds = existing.placements[2] ?? 0;
      existing.thirds = existing.placements[3] ?? 0;
      byUser.set(entry.user_id, existing);
    }
  }

  const rows = [...byUser.values()];
  rows.sort((a, b) => {
    if (mode === "score") return b.score - a.score || a.realName.localeCompare(b.realName);
    const maxPlacement = Math.max(a.placements.length, b.placements.length, 10);
    for (let rank = 1; rank < maxPlacement; rank += 1) {
      const diff = (b.placements[rank] ?? 0) - (a.placements[rank] ?? 0);
      if (diff !== 0) return diff;
    }
    return a.realName.localeCompare(b.realName);
  });

  let previousKey = "";
  let previousRank = 0;
  return rows.map((row, index) => {
    const key =
      mode === "score"
        ? String(row.score)
        : Array.from({ length: 20 }, (_, i) => row.placements[i + 1] ?? 0).join(",");
    const rank = key === previousKey ? previousRank : index + 1;
    previousKey = key;
    previousRank = rank;
    return { ...row, rank };
  });
}
