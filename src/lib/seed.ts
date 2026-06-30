import crypto from "node:crypto";
import { hashSync } from "bcryptjs";
import { getDb, nowIso } from "@/lib/db";
import { ensureDefaultLeagues } from "@/lib/leagues";

const demoUsers = [
  ["member1", "김민준"],
  ["member2", "이서연"],
  ["member3", "박지훈"],
  ["member4", "최하은"],
] as const;

const demoEntries = [
  ["S3LSE1", "member1", "Apple", "AAPL", "US", "USD", 195, 207],
  ["S3LSE1", "member2", "Samsung Electronics", "005930", "KR", "KRW", 78000, 81200],
  ["S3LSE1", "member3", "NVIDIA", "NVDA", "US", "USD", 142, 153],
  ["S3LSE1", "member4", "Meta Platforms", "META", "US", "USD", 718, 705],
  ["S3LME1", "member1", "Microsoft", "MSFT", "US", "USD", 470, 486],
  ["S3LME1", "member2", "Hyundai Motor", "005380", "KR", "KRW", 249000, 238000],
  ["S3LME1", "member3", "Kakao", "035720", "KR", "KRW", 59000, 61200],
  ["S3LME1", "member4", "Tesla", "TSLA", "US", "USD", 330, 350],
  ["S3LLE1", "member1", "Alphabet", "GOOGL", "US", "USD", 176, 183],
  ["S3LLE1", "member2", "Netflix", "NFLX", "US", "USD", 1210, 1244],
  ["S3LLE1", "member3", "SK Hynix", "000660", "KR", "KRW", 241000, 260000],
  ["S3LLE1", "member4", "Amazon", "AMZN", "US", "USD", 218, 214],
] as const;

function seededClose(startPrice: number, currentPrice: number, dayIndex: number, entryIndex: number) {
  const lastIndex = 6;
  if (dayIndex === 0) return startPrice;
  if (dayIndex === lastIndex) return currentPrice;

  const delta = currentPrice - startPrice;
  const progress = dayIndex / lastIndex;
  const wave = Math.sin((dayIndex + entryIndex + 1) * 1.15) * Math.max(Math.abs(delta) * 0.18, startPrice * 0.003);
  return Math.max(startPrice * 0.1, startPrice + delta * progress + wave);
}

export function seedDebugData(actorId: string) {
  ensureDefaultLeagues();
  const db = getDb();
  const passwordHash = hashSync("password123", 12);
  const now = nowIso();

  const tx = db.transaction(() => {
    for (const [id, realName] of demoUsers) {
      db.prepare(
        `INSERT INTO users
         (id, password_hash, real_name, role, approval_status, active_status, invite_code_used,
          signup_ip_hash, latest_login_ip, duplicate_ip_flag, created_at, updated_at)
         VALUES (?, ?, ?, 'member', 'approved', 'active', NULL, ?, 'debug', 0, ?, ?)
         ON CONFLICT(id) DO UPDATE SET real_name = excluded.real_name, approval_status = 'approved', active_status = 'active', updated_at = excluded.updated_at`
      ).run(id, passwordHash, realName, `debug-${id}`, now, now);
    }

    demoEntries.forEach(([leagueId, userId, stockName, symbol, market, currency, startPrice, currentPrice], entryIndex) => {
      const existing = db
        .prepare("SELECT id FROM league_entries WHERE league_id = ? AND user_id = ?")
        .get(leagueId, userId) as { id: string } | undefined;
      const league = db.prepare("SELECT starts_at FROM leagues WHERE id = ?").get(leagueId) as { starts_at: string };
      const entryId = existing?.id ?? crypto.randomUUID();
      db.prepare(
        `INSERT INTO league_entries
         (id, league_id, user_id, stock_name, symbol, market, reason, start_price, currency,
          end_price, early_confirm_price, ranking_price, current_price, provider, last_price_at,
          created_at, updated_at, ended_at, early_confirmed_at, early_confirmed, manual_price_required, disqualified)
         VALUES (?, ?, ?, ?, ?, ?, 'debug seed registration reason over 20 bytes', ?, ?, NULL, NULL, NULL, ?, 'debug-seed', ?, ?, ?, NULL, NULL, 0, 0, 0)
         ON CONFLICT(league_id, user_id) DO UPDATE SET
          stock_name = excluded.stock_name,
          symbol = excluded.symbol,
          market = excluded.market,
          start_price = excluded.start_price,
          currency = excluded.currency,
          current_price = excluded.current_price,
          provider = excluded.provider,
          last_price_at = excluded.last_price_at,
          updated_at = excluded.updated_at`
      ).run(entryId, leagueId, userId, stockName, symbol, market, startPrice, currency, currentPrice, now, now, now);

      for (let index = 0; index < 7; index += 1) {
        const snapshotDate = new Date(league.starts_at);
        snapshotDate.setUTCDate(snapshotDate.getUTCDate() + index);
        const price = seededClose(Number(startPrice), Number(currentPrice), index, entryIndex);
        db.prepare(
          `INSERT INTO price_snapshots (id, league_entry_id, captured_at, price, provider)
           VALUES (?, ?, ?, ?, 'debug-seed')
           ON CONFLICT(id) DO UPDATE SET
             captured_at = excluded.captured_at,
             price = excluded.price,
             provider = excluded.provider`
        ).run(`${entryId}-${index}`, entryId, snapshotDate.toISOString(), Number(price.toFixed(2)));
      }
    });

    db.prepare(
      `INSERT INTO audit_logs
       (actor_id, action_type, target_table, target_key, before_value, after_value, reason, created_at)
       VALUES (?, 'create', 'debug_seed', 'seedDebugData', NULL, ?, 'admin debug seed', ?)`
    ).run(actorId, JSON.stringify({ demoUsers: demoUsers.length, demoEntries: demoEntries.length }), now);
  });

  tx();
}
