import { dbAll, dbBatch, dbGet, dbRun, nowIso } from "@/lib/db";
import { buildFinalizationPatch, pickFinalClose } from "@/lib/finalization";
import { historicalCloses, insertPriceSnapshot } from "@/lib/markets";
import { calculateRebalancedPortfolioIndex } from "@/lib/portfolio";
import type { League, LeagueEntry, LeagueEntryWithUser, LeagueType, RankedEntry } from "@/lib/types";

function kstUtcIso(year: number, month: number, day: number, hour = 5) {
  return new Date(Date.UTC(year, month - 1, day, hour - 9, 0, 0)).toISOString();
}

function minusDays(iso: string, days: number) {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString();
}

function addMonthsKst(year: number, month: number, plus: number) {
  const date = new Date(Date.UTC(year, month - 1 + plus, 1, -4, 0, 0));
  return date.toISOString();
}

function leagueInsertArgs(row: League) {
  return {
    id: row.id,
    season_number: row.season_number,
    league_type: row.league_type,
    episode: row.episode,
    name: row.name,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    registration_opens_at: row.registration_opens_at,
    early_confirm_opens_at: row.early_confirm_opens_at,
    created_at: row.created_at,
  };
}

export async function ensureDefaultLeagues() {
  const exists = await dbGet<{ count: number | bigint }>("SELECT COUNT(*) AS count FROM leagues");
  if (Number(exists?.count ?? 0) > 0) return;

  const createdAt = nowIso();
  const seasonNumber = 3;
  const seasonStartYear = 2026;
  const seasonStartMonth = 7;
  const seasonEnd = kstUtcIso(2027, 1, 1);
  const rows: League[] = [];

  for (let episode = 1; episode <= 6; episode += 1) {
    const startsAt = addMonthsKst(seasonStartYear, seasonStartMonth, episode - 1);
    const endsAt = addMonthsKst(seasonStartYear, seasonStartMonth, episode);
    rows.push({
      id: `S${seasonNumber}LSE${episode}`,
      season_number: seasonNumber,
      league_type: "S",
      episode,
      name: `S${seasonNumber}LSE${episode}`,
      starts_at: startsAt,
      ends_at: endsAt,
      registration_opens_at: minusDays(startsAt, 7),
      early_confirm_opens_at: minusDays(endsAt, 7),
      created_at: createdAt,
    });
  }

  for (let episode = 1; episode <= 2; episode += 1) {
    const startsAt = addMonthsKst(seasonStartYear, seasonStartMonth, (episode - 1) * 3);
    const endsAt = addMonthsKst(seasonStartYear, seasonStartMonth, episode * 3);
    rows.push({
      id: `S${seasonNumber}LME${episode}`,
      season_number: seasonNumber,
      league_type: "M",
      episode,
      name: `S${seasonNumber}LME${episode}`,
      starts_at: startsAt,
      ends_at: endsAt,
      registration_opens_at: minusDays(startsAt, 7),
      early_confirm_opens_at: minusDays(endsAt, 14),
      created_at: createdAt,
    });
  }

  rows.push({
    id: `S${seasonNumber}LLE1`,
    season_number: seasonNumber,
    league_type: "L",
    episode: 1,
    name: `S${seasonNumber}LLE1`,
    starts_at: kstUtcIso(seasonStartYear, seasonStartMonth, 1),
    ends_at: seasonEnd,
    registration_opens_at: minusDays(kstUtcIso(seasonStartYear, seasonStartMonth, 1), 7),
    early_confirm_opens_at: minusDays(seasonEnd, 28),
    created_at: createdAt,
  });

  await dbBatch(
    rows.map((row) => ({
      sql: `INSERT OR IGNORE INTO leagues
        (id, season_number, league_type, episode, name, starts_at, ends_at, registration_opens_at, early_confirm_opens_at, created_at)
       VALUES
        (@id, @season_number, @league_type, @episode, @name, @starts_at, @ends_at, @registration_opens_at, @early_confirm_opens_at, @created_at)`,
      args: leagueInsertArgs(row),
    }))
  );
}

export async function getDebugNow() {
  const row = await dbGet<{ value: string }>("SELECT value FROM debug_state WHERE key = 'now'");
  return row?.value ? new Date(row.value) : new Date();
}

export async function getVisibleLeagues() {
  await ensureDefaultLeagues();
  const now = (await getDebugNow()).toISOString();
  const rows = await dbAll<League>(
    `SELECT * FROM leagues
     WHERE registration_opens_at <= ? AND ends_at > ?
     ORDER BY starts_at ASC,
       CASE league_type WHEN 'S' THEN 1 WHEN 'M' THEN 2 ELSE 3 END ASC`,
    [now, now]
  );

  const byType = new Map<LeagueType, League>();
  for (const row of rows) {
    if (!byType.has(row.league_type)) byType.set(row.league_type, row);
  }
  return (["S", "M", "L"] as LeagueType[]).map((type) => byType.get(type)).filter(Boolean) as League[];
}

export async function getAllLeagues() {
  await ensureDefaultLeagues();
  return dbAll<League>(
    `SELECT * FROM leagues
     ORDER BY starts_at DESC,
       CASE league_type WHEN 'L' THEN 1 WHEN 'M' THEN 2 ELSE 3 END ASC`
  );
}

export async function getStartedLeagues() {
  await ensureDefaultLeagues();
  const now = (await getDebugNow()).toISOString();
  return dbAll<League>(
    `SELECT * FROM leagues
     WHERE starts_at <= ?
     ORDER BY starts_at DESC,
       CASE league_type WHEN 'L' THEN 1 WHEN 'M' THEN 2 ELSE 3 END ASC`,
    [now]
  );
}

export async function getLeague(id: string) {
  await ensureDefaultLeagues();
  return dbGet<League>("SELECT * FROM leagues WHERE id = ?", [id]);
}

function finalPriceWindow(endsAt: string) {
  const to = new Date(endsAt);
  const from = new Date(endsAt);
  from.setUTCDate(from.getUTCDate() - 14);
  return { from, to };
}

async function getStoredFinalPrice(entryId: string, endsAt: string) {
  return dbGet<{ at: string; price: number }>(
    `SELECT captured_at AS at, price
     FROM price_snapshots
     WHERE league_entry_id = ? AND captured_at <= ?
     ORDER BY captured_at DESC
     LIMIT 1`,
    [entryId, endsAt]
  );
}

export async function finalizeEndedLeagues() {
  await ensureDefaultLeagues();
  const now = (await getDebugNow()).toISOString();
  const rows = await dbAll<LeagueEntry & { league_ends_at: string }>(
    `SELECT league_entries.*, leagues.ends_at AS league_ends_at
     FROM league_entries
     JOIN leagues ON leagues.id = league_entries.league_id
     WHERE leagues.ends_at <= ?
       AND league_entries.disqualified = 0
       AND (league_entries.ended_at IS NULL OR league_entries.ranking_price IS NULL)
     ORDER BY leagues.ends_at ASC, league_entries.updated_at ASC`,
    [now]
  );

  for (const row of rows) {
    let finalPrice = null;
    const fixedPrice = row.ranking_price ?? (row.early_confirmed ? row.early_confirm_price : null);

    if (fixedPrice == null) {
      if (row.provider === "debug-seed") {
        const point = await getStoredFinalPrice(row.id, row.league_ends_at);
        if (point) finalPrice = { price: point.price, provider: "debug-seed", at: point.at };
      } else {
        try {
          const { from, to } = finalPriceWindow(row.league_ends_at);
          const history = await historicalCloses(row.symbol, from, to);
          const point = pickFinalClose(history.points, row.league_ends_at);
          if (!point) throw new Error("No close before league end");
          finalPrice = { price: point.close, provider: history.provider, at: point.date };
        } catch {
          await dbRun("UPDATE league_entries SET manual_price_required = 1, updated_at = ? WHERE id = ?", [nowIso(), row.id]);
          continue;
        }
      }

      if (!finalPrice) {
        await dbRun("UPDATE league_entries SET manual_price_required = 1, updated_at = ? WHERE id = ?", [nowIso(), row.id]);
        continue;
      }
    }

    const patch = buildFinalizationPatch(row, row.league_ends_at, finalPrice);
    if (!patch) continue;

    await dbRun(
      `UPDATE league_entries
       SET end_price = COALESCE(end_price, ?),
           ranking_price = ?,
           current_price = ?,
           provider = ?,
           last_price_at = ?,
           ended_at = ?,
           manual_price_required = ?,
           updated_at = ?
       WHERE id = ?`,
      [
        patch.endPrice,
        patch.rankingPrice,
        patch.currentPrice,
        patch.provider,
        patch.lastPriceAt,
        patch.endedAt,
        patch.manualPriceRequired,
        nowIso(),
        row.id,
      ]
    );

    if (patch.snapshot) {
      await insertPriceSnapshot(row.id, patch.snapshot.price, patch.snapshot.provider, patch.snapshot.at);
    }
  }
}

export async function canRegister(league: League) {
  const now = (await getDebugNow()).toISOString();
  return league.registration_opens_at <= now && now < league.starts_at;
}

export async function canEarlyConfirm(league: League) {
  const now = (await getDebugNow()).toISOString();
  return league.early_confirm_opens_at <= now && now < league.ends_at;
}

export async function getEntriesForLeague(leagueId: string) {
  return dbAll<LeagueEntryWithUser>(
    `SELECT league_entries.*, users.real_name, users.approval_status
     FROM league_entries
     JOIN users ON users.id = league_entries.user_id
     WHERE league_entries.league_id = ?
     ORDER BY users.real_name ASC`,
    [leagueId]
  );
}

export async function getApprovedActiveMembers() {
  return dbAll<Array<{ id: string; real_name: string }>[number]>(
    `SELECT id, real_name
     FROM users
     WHERE role = 'member'
       AND approval_status = 'approved'
       AND active_status = 'active'
     ORDER BY real_name ASC`
  );
}

export function rankEntries(entries: LeagueEntryWithUser[]) {
  const ranked = entries
    .filter((entry) => entry.disqualified === 0)
    .map((entry) => {
      const basisPrice =
        entry.ranking_price ??
        entry.early_confirm_price ??
        entry.end_price ??
        entry.current_price ??
        entry.start_price;
      const returnPct = ((basisPrice - entry.start_price) / entry.start_price) * 100;
      return { ...entry, basisPrice, returnPct, rank: 0 };
    })
    .sort((a, b) => b.returnPct - a.returnPct);

  let lastReturn: number | null = null;
  let lastRank = 0;
  return ranked.map((entry, index) => {
    const rank = lastReturn === entry.returnPct ? lastRank : index + 1;
    lastReturn = entry.returnPct;
    lastRank = rank;
    return { ...entry, rank };
  }) as RankedEntry[];
}

export async function getRankedEntriesForLeague(leagueId: string) {
  return rankEntries(await getEntriesForLeague(leagueId));
}

export async function getDashboardRowsForLeague(league: League) {
  const members = await getApprovedActiveMembers();
  const entries = await getEntriesForLeague(league.id);
  const ranked = rankEntries(entries);
  const rankedUserIds = new Set(ranked.map((entry) => entry.user_id));
  const entryByUserId = new Map(entries.map((entry) => [entry.user_id, entry]));
  const now = (await getDebugNow()).toISOString();

  const inactiveRows = members
    .filter((member) => !rankedUserIds.has(member.id))
    .map((member) => {
      const entry = entryByUserId.get(member.id);
      const status = entry?.disqualified ? "실격" : league.starts_at <= now ? "실격" : "미등록";
      return {
        kind: "inactive" as const,
        user_id: member.id,
        real_name: member.real_name,
        status,
      };
    });

  return [
    ...ranked.map((entry) => ({ kind: "ranked" as const, entry })),
    ...inactiveRows,
  ];
}

export async function getPriceSeries(entryId: string) {
  return dbAll<{ date: string; close: number }>(
    `SELECT captured_at AS date, price AS close
     FROM price_snapshots
     WHERE league_entry_id = ?
     ORDER BY captured_at ASC`,
    [entryId]
  );
}

export async function getPortfolioIndex(leagueIds: string[]) {
  if (leagueIds.length === 0) return 1000;
  const placeholders = leagueIds.map(() => "?").join(",");
  const rows = await dbAll<{ start_price: number; basis: number }>(
    `SELECT start_price, COALESCE(ranking_price, early_confirm_price, end_price, current_price, start_price) AS basis
     FROM league_entries
     WHERE league_id IN (${placeholders}) AND disqualified = 0`,
    leagueIds
  );
  if (rows.length === 0) return 1000;
  const avgReturn = rows.reduce((sum, row) => sum + row.basis / row.start_price, 0) / rows.length;
  return 1000 * avgReturn;
}

async function getLeagueReturnFactor(leagueId: string) {
  const rows = await dbAll<{ start_price: number; basis: number }>(
    `SELECT start_price, COALESCE(ranking_price, early_confirm_price, end_price, current_price, start_price) AS basis
     FROM league_entries
     WHERE league_id = ? AND disqualified = 0`,
    [leagueId]
  );

  if (rows.length === 0) return 1;
  return rows.reduce((sum, row) => sum + row.basis / row.start_price, 0) / rows.length;
}

export async function getRebalancedPortfolioIndex() {
  const leagues = (await getStartedLeagues()).slice().sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const segments = await Promise.all(
    leagues.map(async (league) => ({
      leagueType: league.league_type,
      startsAt: league.starts_at,
      factor: await getLeagueReturnFactor(league.id),
    }))
  );

  return calculateRebalancedPortfolioIndex(segments, 1000);
}
