import { getDb, nowIso } from "@/lib/db";
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

export function ensureDefaultLeagues() {
  const db = getDb();
  const exists = db.prepare("SELECT COUNT(*) AS count FROM leagues").get() as { count: number };
  if (exists.count > 0) return;

  const createdAt = nowIso();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO leagues
      (id, season_number, league_type, episode, name, starts_at, ends_at, registration_opens_at, early_confirm_opens_at, created_at)
    VALUES
      (@id, @season_number, @league_type, @episode, @name, @starts_at, @ends_at, @registration_opens_at, @early_confirm_opens_at, @created_at)
  `);

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

  const tx = db.transaction((items: League[]) => {
    for (const item of items) insert.run(item);
  });
  tx(rows);
}

export function getDebugNow() {
  const row = getDb().prepare("SELECT value FROM debug_state WHERE key = 'now'").get() as
    | { value: string }
    | undefined;
  return row?.value ? new Date(row.value) : new Date();
}

export function getVisibleLeagues() {
  ensureDefaultLeagues();
  const now = getDebugNow().toISOString();
  const rows = getDb()
    .prepare(
      `SELECT * FROM leagues
       WHERE registration_opens_at <= ? AND ends_at > ?
       ORDER BY starts_at ASC,
         CASE league_type WHEN 'S' THEN 1 WHEN 'M' THEN 2 ELSE 3 END ASC`
    )
    .all(now, now) as League[];

  const byType = new Map<LeagueType, League>();
  for (const row of rows) {
    if (!byType.has(row.league_type)) byType.set(row.league_type, row);
  }
  return (["S", "M", "L"] as LeagueType[]).map((type) => byType.get(type)).filter(Boolean) as League[];
}

export function getAllLeagues() {
  ensureDefaultLeagues();
  return getDb()
    .prepare(
      `SELECT * FROM leagues
       ORDER BY starts_at DESC,
         CASE league_type WHEN 'L' THEN 1 WHEN 'M' THEN 2 ELSE 3 END ASC`
    )
    .all() as League[];
}

export function getStartedLeagues() {
  ensureDefaultLeagues();
  const now = getDebugNow().toISOString();
  return getDb()
    .prepare(
      `SELECT * FROM leagues
       WHERE starts_at <= ?
       ORDER BY starts_at DESC,
         CASE league_type WHEN 'L' THEN 1 WHEN 'M' THEN 2 ELSE 3 END ASC`
    )
    .all(now) as League[];
}

export function getLeague(id: string) {
  ensureDefaultLeagues();
  return getDb().prepare("SELECT * FROM leagues WHERE id = ?").get(id) as League | undefined;
}

function finalPriceWindow(endsAt: string) {
  const to = new Date(endsAt);
  const from = new Date(endsAt);
  from.setUTCDate(from.getUTCDate() - 14);
  return { from, to };
}

function getStoredFinalPrice(entryId: string, endsAt: string) {
  return getDb()
    .prepare(
      `SELECT captured_at AS at, price
       FROM price_snapshots
       WHERE league_entry_id = ? AND captured_at <= ?
       ORDER BY captured_at DESC
       LIMIT 1`
    )
    .get(entryId, endsAt) as { at: string; price: number } | undefined;
}

export async function finalizeEndedLeagues() {
  ensureDefaultLeagues();
  const db = getDb();
  const now = getDebugNow().toISOString();
  const rows = db
    .prepare(
      `SELECT league_entries.*, leagues.ends_at AS league_ends_at
       FROM league_entries
       JOIN leagues ON leagues.id = league_entries.league_id
       WHERE leagues.ends_at <= ?
         AND league_entries.disqualified = 0
         AND (league_entries.ended_at IS NULL OR league_entries.ranking_price IS NULL)
       ORDER BY leagues.ends_at ASC, league_entries.updated_at ASC`
    )
    .all(now) as Array<LeagueEntry & { league_ends_at: string }>;

  for (const row of rows) {
    let finalPrice = null;
    const fixedPrice = row.ranking_price ?? (row.early_confirmed ? row.early_confirm_price : null);

    if (fixedPrice == null) {
      if (row.provider === "debug-seed") {
        const point = getStoredFinalPrice(row.id, row.league_ends_at);
        if (point) finalPrice = { price: point.price, provider: "debug-seed", at: point.at };
      } else {
        try {
          const { from, to } = finalPriceWindow(row.league_ends_at);
          const history = await historicalCloses(row.symbol, from, to);
          const point = pickFinalClose(history.points, row.league_ends_at);
          if (!point) throw new Error("No close before league end");
          finalPrice = { price: point.close, provider: history.provider, at: point.date };
        } catch {
          db.prepare("UPDATE league_entries SET manual_price_required = 1, updated_at = ? WHERE id = ?").run(nowIso(), row.id);
          continue;
        }
      }

      if (!finalPrice) {
        db.prepare("UPDATE league_entries SET manual_price_required = 1, updated_at = ? WHERE id = ?").run(nowIso(), row.id);
        continue;
      }
    }

    const patch = buildFinalizationPatch(row, row.league_ends_at, finalPrice);
    if (!patch) continue;

    db.prepare(
      `UPDATE league_entries
       SET end_price = COALESCE(end_price, ?),
           ranking_price = ?,
           current_price = ?,
           provider = ?,
           last_price_at = ?,
           ended_at = ?,
           manual_price_required = ?,
           updated_at = ?
       WHERE id = ?`
    ).run(
      patch.endPrice,
      patch.rankingPrice,
      patch.currentPrice,
      patch.provider,
      patch.lastPriceAt,
      patch.endedAt,
      patch.manualPriceRequired,
      nowIso(),
      row.id
    );

    if (patch.snapshot) {
      insertPriceSnapshot(row.id, patch.snapshot.price, patch.snapshot.provider, patch.snapshot.at);
    }
  }
}

export function canRegister(league: League) {
  const now = getDebugNow().toISOString();
  return league.registration_opens_at <= now && now < league.starts_at;
}

export function canEarlyConfirm(league: League) {
  const now = getDebugNow().toISOString();
  return league.early_confirm_opens_at <= now && now < league.ends_at;
}

export function getEntriesForLeague(leagueId: string) {
  return getDb()
    .prepare(
      `SELECT league_entries.*, users.real_name, users.approval_status
       FROM league_entries
       JOIN users ON users.id = league_entries.user_id
       WHERE league_entries.league_id = ?
       ORDER BY users.real_name ASC`
    )
    .all(leagueId) as LeagueEntryWithUser[];
}

export function getApprovedActiveMembers() {
  return getDb()
    .prepare(
      `SELECT id, real_name
       FROM users
       WHERE role = 'member'
         AND approval_status = 'approved'
         AND active_status = 'active'
       ORDER BY real_name ASC`
    )
    .all() as Array<{ id: string; real_name: string }>;
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

export function getRankedEntriesForLeague(leagueId: string) {
  return rankEntries(getEntriesForLeague(leagueId));
}

export function getDashboardRowsForLeague(league: League) {
  const members = getApprovedActiveMembers();
  const entries = getEntriesForLeague(league.id);
  const ranked = rankEntries(entries);
  const rankedUserIds = new Set(ranked.map((entry) => entry.user_id));
  const entryByUserId = new Map(entries.map((entry) => [entry.user_id, entry]));
  const now = getDebugNow().toISOString();

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

export function getPriceSeries(entryId: string) {
  return getDb()
    .prepare(
      `SELECT captured_at AS date, price AS close
       FROM price_snapshots
       WHERE league_entry_id = ?
       ORDER BY captured_at ASC`
    )
    .all(entryId) as { date: string; close: number }[];
}

export function getPortfolioIndex(leagueIds: string[]) {
  if (leagueIds.length === 0) return 1000;
  const placeholders = leagueIds.map(() => "?").join(",");
  const rows = getDb()
    .prepare(
      `SELECT start_price, COALESCE(ranking_price, early_confirm_price, end_price, current_price, start_price) AS basis
       FROM league_entries
       WHERE league_id IN (${placeholders}) AND disqualified = 0`
    )
    .all(...leagueIds) as { start_price: number; basis: number }[];
  if (rows.length === 0) return 1000;
  const avgReturn = rows.reduce((sum, row) => sum + row.basis / row.start_price, 0) / rows.length;
  return 1000 * avgReturn;
}

function getLeagueReturnFactor(leagueId: string) {
  const rows = getDb()
    .prepare(
      `SELECT start_price, COALESCE(ranking_price, early_confirm_price, end_price, current_price, start_price) AS basis
       FROM league_entries
       WHERE league_id = ? AND disqualified = 0`
    )
    .all(leagueId) as { start_price: number; basis: number }[];

  if (rows.length === 0) return 1;
  return rows.reduce((sum, row) => sum + row.basis / row.start_price, 0) / rows.length;
}

export function getRebalancedPortfolioIndex() {
  const leagues = getStartedLeagues().slice().sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const segments = leagues.map((league) => ({
    leagueType: league.league_type,
    startsAt: league.starts_at,
    factor: getLeagueReturnFactor(league.id),
  }));

  return calculateRebalancedPortfolioIndex(segments, 1000);
}
