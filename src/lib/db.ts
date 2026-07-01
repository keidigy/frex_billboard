import fs from "node:fs";
import path from "node:path";
import { createClient, type Client, type InArgs, type ResultSet } from "@libsql/client";

type TransactionMode = "write" | "read" | "deferred";

export type SqlStatement = {
  sql: string;
  args?: InArgs;
};

let client: Client | null = null;
let schemaReady: Promise<void> | null = null;

function getLocalDbPath() {
  return process.env.FREX_DB_PATH ?? path.join(process.cwd(), ".db", "frex-billboard.sqlite");
}

function getClient() {
  if (client) return client;

  const tursoUrl = process.env.TURSO_DATABASE_URL;
  if (tursoUrl) {
    if (!process.env.TURSO_AUTH_TOKEN && !tursoUrl.startsWith("file:")) {
      throw new Error("Turso 원격 DB를 사용하려면 TURSO_AUTH_TOKEN이 필요합니다.");
    }
    client = createClient({
      url: tursoUrl,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    return client;
  }

  if (process.env.VERCEL) {
    throw new Error("Vercel 배포 환경에서는 TURSO_DATABASE_URL/TURSO_AUTH_TOKEN이 필요합니다.");
  }

  const dbPath = getLocalDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  client = createClient({ url: `file:${dbPath}` });
  return client;
}

const schemaStatements = [
  "PRAGMA foreign_keys = ON",
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    password_hash TEXT NOT NULL,
    real_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
    approval_status TEXT NOT NULL CHECK (approval_status IN ('pending', 'approved', 'rejected')),
    active_status TEXT NOT NULL CHECK (active_status IN ('active', 'deactivated')),
    invite_code_used TEXT,
    signup_ip_hash TEXT,
    latest_login_ip TEXT,
    duplicate_ip_flag INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS invite_codes (
    code TEXT PRIMARY KEY,
    issuer_id TEXT NOT NULL,
    used_by_user_id TEXT,
    issued_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    status TEXT NOT NULL CHECK (status IN ('active', 'used', 'expired', 'revoked')),
    FOREIGN KEY (issuer_id) REFERENCES users(id),
    FOREIGN KEY (used_by_user_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS leagues (
    id TEXT PRIMARY KEY,
    season_number INTEGER NOT NULL,
    league_type TEXT NOT NULL CHECK (league_type IN ('S', 'M', 'L')),
    episode INTEGER NOT NULL,
    name TEXT NOT NULL,
    starts_at TEXT NOT NULL,
    ends_at TEXT NOT NULL,
    registration_opens_at TEXT NOT NULL,
    early_confirm_opens_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (season_number, league_type, episode)
  )`,
  `CREATE TABLE IF NOT EXISTS league_entries (
    id TEXT PRIMARY KEY,
    league_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    stock_name TEXT NOT NULL,
    symbol TEXT NOT NULL,
    market TEXT NOT NULL,
    reason TEXT,
    start_price REAL NOT NULL,
    currency TEXT NOT NULL CHECK (currency IN ('KRW', 'USD')),
    end_price REAL,
    early_confirm_price REAL,
    ranking_price REAL,
    current_price REAL,
    provider TEXT,
    last_price_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    ended_at TEXT,
    early_confirmed_at TEXT,
    early_confirmed INTEGER NOT NULL DEFAULT 0,
    manual_price_required INTEGER NOT NULL DEFAULT 0,
    disqualified INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (league_id) REFERENCES leagues(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE (league_id, user_id),
    UNIQUE (league_id, symbol)
  )`,
  `CREATE TABLE IF NOT EXISTS price_snapshots (
    id TEXT PRIMARY KEY,
    league_entry_id TEXT NOT NULL,
    captured_at TEXT NOT NULL,
    price REAL NOT NULL,
    provider TEXT NOT NULL,
    FOREIGN KEY (league_entry_id) REFERENCES league_entries(id)
  )`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id TEXT NOT NULL,
    action_type TEXT NOT NULL,
    target_table TEXT NOT NULL,
    target_key TEXT NOT NULL,
    before_value TEXT,
    after_value TEXT,
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS debug_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
];

async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = getClient().batch(
      schemaStatements.map((sql) => ({ sql })),
      "write"
    ).then(() => undefined);
  }
  await schemaReady;
}

export async function dbRun(sql: string, args: InArgs = []) {
  await ensureSchema();
  return getClient().execute({ sql, args });
}

export async function dbGet<T>(sql: string, args: InArgs = []) {
  const result = await dbRun(sql, args);
  return result.rows[0] as T | undefined;
}

export async function dbAll<T>(sql: string, args: InArgs = []) {
  const result = await dbRun(sql, args);
  return result.rows as T[];
}

export async function dbBatch(statements: SqlStatement[], mode: TransactionMode = "write") {
  if (statements.length === 0) return [] as ResultSet[];
  await ensureSchema();
  return getClient().batch(
    statements.map((statement) => ({
      sql: statement.sql,
      args: statement.args ?? [],
    })),
    mode
  );
}

export async function countUsers() {
  const row = await dbGet<{ count: number | bigint }>("SELECT COUNT(*) AS count FROM users");
  return { count: Number(row?.count ?? 0) };
}

export function nowIso() {
  return new Date().toISOString();
}
