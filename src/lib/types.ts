export type Role = "admin" | "member";
export type ApprovalStatus = "pending" | "approved" | "rejected";
export type ActiveStatus = "active" | "deactivated";
export type LeagueType = "S" | "M" | "L";
export type Currency = "KRW" | "USD";
export type InviteStatus = "active" | "used" | "expired" | "revoked";
export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "deactivate"
  | "manual_price_adjust";

export type User = {
  id: string;
  password_hash: string;
  real_name: string;
  role: Role;
  approval_status: ApprovalStatus;
  active_status: ActiveStatus;
  invite_code_used: string | null;
  signup_ip_hash: string | null;
  latest_login_ip: string | null;
  duplicate_ip_flag: number;
  created_at: string;
  updated_at: string;
};

export type InviteCode = {
  code: string;
  issuer_id: string;
  used_by_user_id: string | null;
  issued_at: string;
  expires_at: string;
  used_at: string | null;
  status: InviteStatus;
};

export type League = {
  id: string;
  season_number: number;
  league_type: LeagueType;
  episode: number;
  name: string;
  starts_at: string;
  ends_at: string;
  registration_opens_at: string;
  early_confirm_opens_at: string;
  created_at: string;
};

export type LeagueEntry = {
  id: string;
  league_id: string;
  user_id: string;
  stock_name: string;
  symbol: string;
  market: string;
  reason: string | null;
  start_price: number;
  currency: Currency;
  end_price: number | null;
  early_confirm_price: number | null;
  ranking_price: number | null;
  current_price: number | null;
  provider: string | null;
  last_price_at: string | null;
  created_at: string;
  updated_at: string;
  ended_at: string | null;
  early_confirmed_at: string | null;
  early_confirmed: number;
  manual_price_required: number;
  disqualified: number;
};

export type LeagueEntryWithUser = LeagueEntry & {
  real_name: string;
  approval_status: ApprovalStatus;
};

export type RankedEntry = LeagueEntryWithUser & {
  rank: number;
  basisPrice: number;
  returnPct: number;
};

export type PricePoint = {
  date: string;
  close: number;
};

export type SymbolSearchResult = {
  symbol: string;
  displaySymbol: string;
  name: string;
  market: "KR" | "US";
  exchange: string;
  currency: Currency;
  type: "stock" | "etf";
  marketCap: number | null;
  source: string;
};
