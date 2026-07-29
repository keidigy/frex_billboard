import { dbAll, dbRun, nowIso } from "@/lib/db";
import { captureWindowStart, selectMissingTradingCloses, shouldCaptureDailyPrice, shouldFinalizeStartingPrice } from "@/lib/daily-price-policy";
import { ensureDefaultLeagues, finalizeEndedLeagues } from "@/lib/leagues";
import { historicalCloses, insertPriceSnapshot, latestClose } from "@/lib/markets";
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
  finalizedStartingPrices: number;
  startPriceFailures: number;
  failedEntries: number;
  failures: CaptureFailure[];
};

async function entriesAwaitingStartingPrice(now: string) {
  await ensureDefaultLeagues();
  const rows = await dbAll<ActiveEntry>(
    `SELECT league_entries.*, leagues.starts_at AS league_starts_at, leagues.ends_at AS league_ends_at
     FROM league_entries
     JOIN leagues ON leagues.id = league_entries.league_id
     WHERE leagues.starts_at <= ?
       AND leagues.ends_at > ?
       AND league_entries.disqualified = 0
       AND league_entries.ended_at IS NULL
       AND league_entries.start_price_finalized_at IS NULL
     ORDER BY leagues.starts_at ASC, league_entries.updated_at ASC`,
    [now, now]
  );

  return rows.filter((row) => shouldFinalizeStartingPrice(row, now));
}

async function finalizeStartingPrices(now: Date, failures: CaptureFailure[]) {
  const nowString = now.toISOString();
  const rows = await entriesAwaitingStartingPrice(nowString);
  let finalized = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const latest = await latestClose(row.symbol);
      const finalizedAt = nowIso();

      // Clear legacy registration-time snapshots before writing the baseline at the league start.
      await dbRun("DELETE FROM price_snapshots WHERE league_entry_id = ? AND captured_at < ?", [row.id, row.league_starts_at]);
      await dbRun(
        `UPDATE league_entries
         SET start_price = ?, current_price = ?, provider = ?, last_price_at = ?,
             start_price_finalized_at = ?, manual_price_required = 0, updated_at = ?
         WHERE id = ? AND start_price_finalized_at IS NULL`,
        [latest.price, latest.price, latest.provider, latest.at, finalizedAt, finalizedAt, row.id]
      );
      await insertPriceSnapshot(row.id, latest.price, latest.provider, row.league_starts_at);
      finalized += 1;
    } catch (error) {
      failed += 1;
      await dbRun(
        `UPDATE league_entries
         SET manual_price_required = 1, updated_at = ?
         WHERE id = ? AND start_price_finalized_at IS NULL`,
        [nowIso(), row.id]
      );
      failures.push({
        entryId: row.id,
        symbol: row.symbol,
        message: `start price: ${error instanceof Error ? error.message : "unknown error"}`,
      });
    }
  }

  return { finalized, failed };
}

async function activeEntriesForDailyCapture(now: string) {
  await ensureDefaultLeagues();
  const rows = await dbAll<ActiveEntry>(
    `SELECT league_entries.*, leagues.starts_at AS league_starts_at, leagues.ends_at AS league_ends_at
     FROM league_entries
     JOIN leagues ON leagues.id = league_entries.league_id
     WHERE leagues.starts_at <= ?
       AND leagues.ends_at > ?
       AND league_entries.disqualified = 0
       AND league_entries.early_confirmed = 0
       AND league_entries.ended_at IS NULL
       AND league_entries.manual_price_required = 0
       AND league_entries.start_price_finalized_at IS NOT NULL
     ORDER BY leagues.starts_at ASC, league_entries.updated_at ASC`,
    [now, now]
  );

  return rows.filter((row) => shouldCaptureDailyPrice(row, now));
}

async function existingSnapshotDates(entryId: string, leagueStartsAt: string) {
  return dbAll<{ date: string }>(
    `SELECT captured_at AS date
     FROM price_snapshots
     WHERE league_entry_id = ?
       AND captured_at > ?`,
    [entryId, leagueStartsAt]
  );
}

export async function captureDailyPriceSnapshots(now = new Date()): Promise<DailyPriceCaptureResult> {
  const nowString = now.toISOString();
  await finalizeEndedLeagues();
  const failures: CaptureFailure[] = [];
  const startPrices = await finalizeStartingPrices(now, failures);
  const rows = await activeEntriesForDailyCapture(nowString);
  const result: DailyPriceCaptureResult = {
    checkedEntries: rows.length,
    updatedEntries: 0,
    insertedSnapshots: 0,
    skippedEntries: 0,
    finalizedStartingPrices: startPrices.finalized,
    startPriceFailures: startPrices.failed,
    failedEntries: 0,
    failures,
  };

  for (const row of rows) {
    try {
      const to = new Date(Math.min(now.getTime(), new Date(row.league_ends_at).getTime()));
      const from = new Date(captureWindowStart(row.league_starts_at, row.last_price_at));
      const history = await historicalCloses(row.symbol, from, to);
      const missing = selectMissingTradingCloses(
        history.points,
        await existingSnapshotDates(row.id, row.league_starts_at),
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
