import { dbAll, dbRun, nowIso } from "@/lib/db";
import { captureWindowStart, selectMissingTradingCloses } from "@/lib/daily-price-policy";
import { ensureDefaultLeagues } from "@/lib/leagues";
import { historicalCloses, insertPriceSnapshot } from "@/lib/markets";
import type { LeagueEntry } from "@/lib/types";

type ActiveEntry = LeagueEntry & {
  league_starts_at: string;
  league_ends_at: string;
};

type CaptureFailure = {
  entryId: string;
  symbol: string;
  message: string;
};

export type DailyPriceCaptureResult = {
  checkedEntries: number;
  updatedEntries: number;
  insertedSnapshots: number;
  skippedEntries: number;
  failedEntries: number;
  failures: CaptureFailure[];
};

async function activeEntriesForDailyCapture(now: string) {
  await ensureDefaultLeagues();
  return dbAll<ActiveEntry>(
    `SELECT league_entries.*, leagues.starts_at AS league_starts_at, leagues.ends_at AS league_ends_at
     FROM league_entries
     JOIN leagues ON leagues.id = league_entries.league_id
     WHERE leagues.starts_at <= ?
       AND leagues.ends_at > ?
       AND league_entries.disqualified = 0
       AND league_entries.early_confirmed = 0
       AND league_entries.ended_at IS NULL
       AND league_entries.manual_price_required = 0
     ORDER BY leagues.starts_at ASC, league_entries.updated_at ASC`,
    [now, now]
  );
}

async function existingSnapshotDates(entryId: string) {
  return dbAll<{ date: string }>(
    `SELECT captured_at AS date
     FROM price_snapshots
     WHERE league_entry_id = ?`,
    [entryId]
  );
}

export async function captureDailyPriceSnapshots(now = new Date()): Promise<DailyPriceCaptureResult> {
  const nowString = now.toISOString();
  const rows = await activeEntriesForDailyCapture(nowString);
  const result: DailyPriceCaptureResult = {
    checkedEntries: rows.length,
    updatedEntries: 0,
    insertedSnapshots: 0,
    skippedEntries: 0,
    failedEntries: 0,
    failures: [],
  };

  for (const row of rows) {
    try {
      const to = new Date(Math.min(now.getTime(), new Date(row.league_ends_at).getTime()));
      const from = new Date(captureWindowStart(row.league_starts_at, row.last_price_at));
      const history = await historicalCloses(row.symbol, from, to);
      const missing = selectMissingTradingCloses(
        history.points,
        await existingSnapshotDates(row.id),
        row.league_starts_at,
        to.toISOString()
      );

      if (missing.length === 0) {
        result.skippedEntries += 1;
        continue;
      }

      for (const point of missing) {
        await insertPriceSnapshot(row.id, point.close, history.provider, point.date);
      }

      const latest = missing[missing.length - 1];
      await dbRun(
        `UPDATE league_entries
         SET current_price = ?, provider = ?, last_price_at = ?, updated_at = ?
         WHERE id = ?`,
        [latest.close, history.provider, latest.date, nowIso(), row.id]
      );

      result.updatedEntries += 1;
      result.insertedSnapshots += missing.length;
    } catch (error) {
      result.failedEntries += 1;
      result.failures.push({
        entryId: row.id,
        symbol: row.symbol,
        message: error instanceof Error ? error.message : "unknown error",
      });
    }
  }

  return result;
}
