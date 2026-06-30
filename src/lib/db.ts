import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

let database: Database.Database | null = null;

function getDbPath() {
  if (process.env.FREX_DB_PATH) return process.env.FREX_DB_PATH;
  if (process.env.VERCEL) return path.join("/tmp", "frex-billboard.sqlite");
  return path.join(process.cwd(), ".db", "frex-billboard.sqlite");
}

export function getDb() {
  if (!database) {
    const dbPath = getDbPath();
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    database = new Database(dbPath);
    database.pragma("journal_mode = WAL");
    database.pragma("foreign_keys = ON");
    ensureSchema(database);
  }

  return database;
}

function ensureSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
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
    );

    CREATE TABLE IF NOT EXISTS invite_codes (
      code TEXT PRIMARY KEY,
      issuer_id TEXT NOT NULL,
      used_by_user_id TEXT,
      issued_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      status TEXT NOT NULL CHECK (status IN ('active', 'used', 'expired', 'revoked')),
      FOREIGN KEY (issuer_id) REFERENCES users(id),
      FOREIGN KEY (used_by_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS leagues (
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
    );

    CREATE TABLE IF NOT EXISTS league_entries (
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
    );

    CREATE TABLE IF NOT EXISTS price_snapshots (
      id TEXT PRIMARY KEY,
      league_entry_id TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      price REAL NOT NULL,
      provider TEXT NOT NULL,
      FOREIGN KEY (league_entry_id) REFERENCES league_entries(id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      target_table TEXT NOT NULL,
      target_key TEXT NOT NULL,
      before_value TEXT,
      after_value TEXT,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS debug_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

export function countUsers() {
  return getDb().prepare("SELECT COUNT(*) AS count FROM users").get() as { count: number };
}

export function nowIso() {
  return new Date().toISOString();
}
