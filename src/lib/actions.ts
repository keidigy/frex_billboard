"use server";

import crypto from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  clearSession,
  createSession,
  hashPassword,
  hmacIp,
  requestIp,
  requireAdmin,
  requirePasswordReadyUser,
  requireUser,
  verifyPassword,
} from "@/lib/auth";
import { countUsers, dbGet, dbRun, nowIso } from "@/lib/db";
import { byteLength } from "@/lib/format";
import { canEarlyConfirm, canRegister, ensureDefaultLeagues, getDebugNow, getLeague } from "@/lib/leagues";
import { currencyFromSearch, insertPriceSnapshot, latestClose } from "@/lib/markets";
import { canonicalMarketSymbol } from "@/lib/market/symbol";
import { deleteDebugData, seedDebugData } from "@/lib/seed";
import type { AuditAction, LeagueEntry, User } from "@/lib/types";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function assertPasswordMatch(password: string, passwordConfirm: string) {
  const error = passwordValidationError(password, passwordConfirm);
  if (error) throw new Error(error);
}

function passwordValidationError(password: string, passwordConfirm: string) {
  if (password.length < 8) return "비밀번호는 8자 이상이어야 합니다.";
  if (password !== passwordConfirm) return "비밀번호 확인이 일치하지 않습니다.";
  return null;
}

function loginError(message: string): never {
  redirect(`/login?loginError=${encodeURIComponent(message)}`);
}

function registerError(message: string): never {
  redirect(`/login?registerError=${encodeURIComponent(message)}`);
}

function temporaryPassword() {
  return `FREX-${crypto.randomBytes(6).toString("base64url")}`;
}

function publicUserAuditValue(user: User | undefined | null) {
  if (!user) return null;
  return {
    id: user.id,
    real_name: user.real_name,
    role: user.role,
    approval_status: user.approval_status,
    active_status: user.active_status,
    password_reset_required: user.password_reset_required,
    updated_at: user.updated_at,
  };
}

async function audit(actorId: string, actionType: AuditAction, targetTable: string, targetKey: string, beforeValue: unknown, afterValue: unknown, reason: string) {
  await dbRun(
    `INSERT INTO audit_logs
     (actor_id, action_type, target_table, target_key, before_value, after_value, reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      actorId,
      actionType,
      targetTable,
      targetKey,
      beforeValue == null ? null : JSON.stringify(beforeValue),
      afterValue == null ? null : JSON.stringify(afterValue),
      reason,
      nowIso(),
    ]
  );
}

export async function createFirstAdminAction(formData: FormData) {
  if ((await countUsers()).count !== 0) throw new Error("최초 admin은 사용자 DB가 비어 있을 때만 생성할 수 있습니다.");
  const id = value(formData, "id");
  const realName = value(formData, "realName");
  const password = value(formData, "password");
  const passwordConfirm = value(formData, "passwordConfirm");
  if (!id || !realName) throw new Error("아이디와 실명은 필수입니다.");
  assertPasswordMatch(password, passwordConfirm);

  const passwordHash = await hashPassword(password);
  const createdAt = nowIso();
  await dbRun(
    `INSERT INTO users
     (id, password_hash, real_name, role, approval_status, active_status, invite_code_used, signup_ip_hash, latest_login_ip, duplicate_ip_flag, created_at, updated_at)
     VALUES (?, ?, ?, 'admin', 'approved', 'active', NULL, NULL, ?, 0, ?, ?)`,
    [id, passwordHash, realName, await requestIp(), createdAt, createdAt]
  );

  await createSession(id);
  await ensureDefaultLeagues();
  redirect("/");
}

export async function loginAction(formData: FormData) {
  const id = value(formData, "id");
  const password = value(formData, "password");
  const user = await dbGet<User>("SELECT * FROM users WHERE id = ?", [id]);
  if (!user || !(await verifyPassword(password, user.password_hash))) loginError("아이디 또는 비밀번호가 올바르지 않습니다.");
  if (user.approval_status !== "approved") loginError("아직 승인되지 않은 계정입니다.");
  if (user.active_status !== "active") loginError("비활성화된 계정입니다.");

  await dbRun("UPDATE users SET latest_login_ip = ?, updated_at = ? WHERE id = ?", [await requestIp(), nowIso(), id]);
  await createSession(id);
  redirect(user.password_reset_required ? "/settings/password" : "/");
}

export async function logoutAction() {
  await clearSession();
  redirect("/login");
}

export async function registerUserAction(formData: FormData) {
  if ((await countUsers()).count === 0) redirect("/setup");

  const id = value(formData, "id");
  const realName = value(formData, "realName");
  const inviteCode = value(formData, "inviteCode");
  const password = value(formData, "password");
  const passwordConfirm = value(formData, "passwordConfirm");
  if (!id || !realName || !inviteCode) registerError("아이디, 실명, 초대 코드는 필수입니다.");
  const passwordError = passwordValidationError(password, passwordConfirm);
  if (passwordError) registerError(passwordError);

  const existingUser = await dbGet<{ id: string }>("SELECT id FROM users WHERE id = ?", [id]);
  if (existingUser) registerError("이미 사용 중인 아이디입니다.");

  const invite = await dbGet<{ code: string }>("SELECT * FROM invite_codes WHERE code = ? AND status = 'active' AND expires_at > ?", [
    inviteCode,
    nowIso(),
  ]);
  if (!invite) registerError("유효한 초대 코드가 아닙니다. admin에게 새 초대 코드를 요청해 주세요.");

  const ipHash = hmacIp(await requestIp());
  const duplicate = await dbGet<{ count: number | bigint }>(
    `SELECT COUNT(*) AS count FROM users
     WHERE signup_ip_hash = ? AND approval_status IN ('pending', 'approved')`,
    [ipHash]
  );

  const createdAt = nowIso();
  const passwordHash = await hashPassword(password);
  await dbRun(
    `INSERT INTO users
     (id, password_hash, real_name, role, approval_status, active_status, invite_code_used, signup_ip_hash, latest_login_ip, duplicate_ip_flag, created_at, updated_at)
     VALUES (?, ?, ?, 'member', 'pending', 'active', ?, ?, NULL, ?, ?, ?)`,
    [id, passwordHash, realName, inviteCode, ipHash, Number(duplicate?.count ?? 0) > 0 ? 1 : 0, createdAt, createdAt]
  );

  await dbRun("UPDATE invite_codes SET used_by_user_id = ?, used_at = ?, status = 'used' WHERE code = ?", [id, createdAt, inviteCode]);
  redirect("/login?registered=1");
}

export async function changePasswordAction(formData: FormData) {
  const user = await requirePasswordReadyUser();
  const currentPassword = value(formData, "currentPassword");
  const newPassword = value(formData, "newPassword");
  const newPasswordConfirm = value(formData, "newPasswordConfirm");
  const dbUser = await dbGet<User>("SELECT * FROM users WHERE id = ?", [user.id]);
  if (!dbUser || !(await verifyPassword(currentPassword, dbUser.password_hash))) throw new Error("현재 비밀번호가 올바르지 않습니다.");
  assertPasswordMatch(newPassword, newPasswordConfirm);
  await dbRun("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?", [await hashPassword(newPassword), nowIso(), user.id]);
  revalidatePath("/settings");
}

export async function completePasswordResetAction(formData: FormData) {
  const user = await requireUser();
  const newPassword = value(formData, "newPassword");
  const newPasswordConfirm = value(formData, "newPasswordConfirm");
  if (!user.password_reset_required) redirect("/settings");
  const passwordError = passwordValidationError(newPassword, newPasswordConfirm);
  if (passwordError) redirect(`/settings/password?error=${encodeURIComponent(passwordError)}`);

  await dbRun("UPDATE users SET password_hash = ?, password_reset_required = 0, updated_at = ? WHERE id = ?", [
    await hashPassword(newPassword),
    nowIso(),
    user.id,
  ]);
  redirect("/");
}

export type ResetUserPasswordState = {
  ok: boolean;
  userId?: string;
  realName?: string;
  temporaryPassword?: string;
  error?: string;
};

export async function resetUserPasswordAction(
  _prevState: ResetUserPasswordState,
  formData: FormData
): Promise<ResetUserPasswordState> {
  try {
    const admin = await requireAdmin();
    const userId = value(formData, "userId");
    if (!userId) return { ok: false, error: "사용자를 선택해야 합니다." };
    if (userId === admin.id) return { ok: false, userId, error: "admin 본인 비밀번호는 여기서 초기화할 수 없습니다." };

    const before = await dbGet<User>("SELECT * FROM users WHERE id = ?", [userId]);
    if (!before) return { ok: false, userId, error: "사용자를 찾을 수 없습니다." };
    if (before.active_status !== "active") return { ok: false, userId, error: "비활성화된 사용자는 초기화할 수 없습니다." };

    const password = temporaryPassword();
    const updatedAt = nowIso();
    await dbRun("UPDATE users SET password_hash = ?, password_reset_required = 1, updated_at = ? WHERE id = ?", [
      await hashPassword(password),
      updatedAt,
      userId,
    ]);
    await dbRun("DELETE FROM sessions WHERE user_id = ?", [userId]);

    const after = await dbGet<User>("SELECT * FROM users WHERE id = ?", [userId]);
    await audit(
      admin.id,
      "password_reset",
      "users",
      userId,
      publicUserAuditValue(before),
      publicUserAuditValue(after),
      "admin temporary password reset"
    );
    revalidatePath("/admin");
    return { ok: true, userId, realName: before.real_name, temporaryPassword: password };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "비밀번호 초기화에 실패했습니다." };
  }
}

export async function createInviteCodeAction(formData: FormData) {
  const admin = await requireAdmin();
  const days = Math.max(Number(value(formData, "days") || "14"), 1);
  const code = crypto.randomBytes(6).toString("hex").toUpperCase();
  const issuedAt = nowIso();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * days).toISOString();
  await dbRun(
    `INSERT INTO invite_codes (code, issuer_id, used_by_user_id, issued_at, expires_at, used_at, status)
     VALUES (?, ?, NULL, ?, ?, NULL, 'active')`,
    [code, admin.id, issuedAt, expiresAt]
  );
  await audit(admin.id, "create", "invite_codes", code, null, { code, expiresAt }, "admin invite issue");
  revalidatePath("/admin");
}

export async function approveUserAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = value(formData, "userId");
  const before = await dbGet<User>("SELECT * FROM users WHERE id = ?", [userId]);
  await dbRun("UPDATE users SET approval_status = 'approved', updated_at = ? WHERE id = ?", [nowIso(), userId]);
  const after = await dbGet<User>("SELECT * FROM users WHERE id = ?", [userId]);
  await audit(admin.id, "update", "users", userId, before, after, "admin approval");
  revalidatePath("/admin");
}

export async function rejectUserAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = value(formData, "userId");
  const before = await dbGet<User>("SELECT * FROM users WHERE id = ?", [userId]);
  await dbRun("UPDATE users SET approval_status = 'rejected', updated_at = ? WHERE id = ?", [nowIso(), userId]);
  const after = await dbGet<User>("SELECT * FROM users WHERE id = ?", [userId]);
  await audit(admin.id, "update", "users", userId, before, after, "admin rejection");
  revalidatePath("/admin");
}

export async function deactivateUserAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = value(formData, "userId");
  const before = await dbGet<User>("SELECT * FROM users WHERE id = ?", [userId]);
  await dbRun("UPDATE users SET active_status = 'deactivated', updated_at = ? WHERE id = ?", [nowIso(), userId]);
  const after = await dbGet<User>("SELECT * FROM users WHERE id = ?", [userId]);
  await audit(admin.id, "deactivate", "users", userId, before, after, "admin deactivation");
  revalidatePath("/admin");
}

export type RegisterLeagueEntryState = {
  ok: boolean;
  action?: "created" | "updated";
  leagueId?: string;
  leagueName?: string;
  stockName?: string;
  symbol?: string;
  startPrice?: number;
  provider?: string;
  manualPriceRequired?: boolean;
  submittedAt?: string;
  error?: string;
};

function registrationError(error: unknown) {
  const message = error instanceof Error ? error.message : "종목 등록에 실패했습니다.";
  if (message.includes("UNIQUE constraint failed") && message.includes("league_entries.league_id") && message.includes("league_entries.symbol")) {
    return "이미 이 리그에 등록된 종목입니다. 다른 종목을 선택해 주세요.";
  }
  return message;
}

function registrationSuccessUrl(state: RegisterLeagueEntryState) {
  const params = new URLSearchParams({
    entryStatus: state.action ?? "created",
    leagueName: state.leagueName ?? "",
    stockName: state.stockName ?? "",
    symbol: state.symbol ?? "",
    startPrice: String(state.startPrice ?? ""),
    provider: state.provider ?? "",
    manualPriceRequired: state.manualPriceRequired ? "1" : "0",
    submittedAt: state.submittedAt ?? nowIso(),
  });
  return `/settings?${params.toString()}`;
}

export async function registerLeagueEntryAction(
  _prevState: RegisterLeagueEntryState,
  formData: FormData
): Promise<RegisterLeagueEntryState> {
  let successState: RegisterLeagueEntryState | null = null;

  try {
    const user = await requirePasswordReadyUser();
    const leagueId = value(formData, "leagueId");
    const stockName = value(formData, "stockName");
    const market = value(formData, "market") === "KR" ? "KR" : "US";
    const symbol = canonicalMarketSymbol(value(formData, "symbol"), market);
    const reason = value(formData, "reason") || null;
    const currency = currencyFromSearch(formData.get("currency"));
    const league = await getLeague(leagueId);
    if (!league) throw new Error("리그를 찾을 수 없습니다.");
    if (!(await canRegister(league))) throw new Error("현재 이 리그는 등록/수정 가능 기간이 아닙니다.");
    if ((league.league_type === "M" || league.league_type === "L") && byteLength(reason ?? "") < 20) {
      throw new Error("중기/장기 리그 등록 사유는 20byte 이상이어야 합니다.");
    }
    if (!stockName || !symbol) throw new Error("종목을 선택해야 합니다.");

    const taken = await dbGet<{ user_id: string }>(
      `SELECT user_id
       FROM league_entries
       WHERE league_id = ?
         AND user_id <> ?
         AND market = ?
         AND CASE
               WHEN market = 'KR' THEN REPLACE(REPLACE(UPPER(symbol), '.KS', ''), '.KQ', '')
               ELSE UPPER(symbol)
             END = ?
       LIMIT 1`,
      [leagueId, user.id, market, symbol]
    );
    if (taken) throw new Error(`${league.name}에는 ${symbol} 종목이 이미 다른 참가자에게 등록되어 있습니다. 다른 종목을 선택해 주세요.`);

    let startPrice = Number(formData.get("startPrice") || 0);
    let provider = "pending-start-price";
    let lastPriceAt: string | null = null;
    try {
      const latest = await latestClose(symbol);
      startPrice = latest.price;
      provider = latest.provider;
      lastPriceAt = latest.at;
    } catch {
      // Registration must remain available even while every quote provider is unavailable.
      // The scheduled start-price capture will retry at the league start.
      if (!startPrice || Number.isNaN(startPrice)) startPrice = 1;
    }

    const now = nowIso();
    const existing = await dbGet<LeagueEntry>("SELECT * FROM league_entries WHERE league_id = ? AND user_id = ?", [leagueId, user.id]);
    const entryId = existing?.id ?? crypto.randomUUID();

    if (existing) {
      const before = existing;
      await dbRun(
        `UPDATE league_entries
         SET stock_name = ?, symbol = ?, market = ?, reason = ?, start_price = ?, currency = ?,
             end_price = NULL, early_confirm_price = NULL, ranking_price = NULL,
             current_price = ?, provider = ?, last_price_at = ?, manual_price_required = ?,
             start_price_finalized_at = NULL, ended_at = NULL, early_confirmed_at = NULL, early_confirmed = 0, updated_at = ?
         WHERE id = ?`,
        [stockName, symbol, market, reason, startPrice, currency, startPrice, provider, lastPriceAt, 0, now, entryId]
      );
      const after = await dbGet<LeagueEntry>("SELECT * FROM league_entries WHERE id = ?", [entryId]);
      await audit(user.id, "update", "league_entries", entryId, before, after, "participant entry update");
    } else {
      await dbRun(
        `INSERT INTO league_entries
         (id, league_id, user_id, stock_name, symbol, market, reason, start_price, currency, end_price, early_confirm_price,
          ranking_price, current_price, provider, last_price_at, created_at, updated_at, ended_at, early_confirmed_at,
          early_confirmed, manual_price_required, disqualified, start_price_finalized_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?, ?, NULL, NULL, 0, 0, 0, NULL)`,
        [entryId, leagueId, user.id, stockName, symbol, market, reason, startPrice, currency, startPrice, provider, lastPriceAt, now, now]
      );
      const after = await dbGet<LeagueEntry>("SELECT * FROM league_entries WHERE id = ?", [entryId]);
      await audit(user.id, "create", "league_entries", entryId, null, after, "participant entry create");
    }

    revalidatePath("/");
    revalidatePath("/leagues");
    revalidatePath("/rankings");
    successState = {
      ok: true,
      action: existing ? "updated" : "created",
      leagueId,
      leagueName: league.name,
      stockName,
      symbol,
      provider: "리그 시작일 05:00 KST 자동 확정 예정",
      submittedAt: now,
    };
  } catch (error) {
    return { ok: false, error: registrationError(error), submittedAt: nowIso() };
  }

  redirect(registrationSuccessUrl(successState));
}

export async function earlyConfirmAction(formData: FormData) {
  const user = await requirePasswordReadyUser();
  const entryId = value(formData, "entryId");
  const entry = await dbGet<LeagueEntry>("SELECT * FROM league_entries WHERE id = ? AND user_id = ?", [entryId, user.id]);
  if (!entry) throw new Error("본인 종목만 확정할 수 있습니다.");
  if (entry.early_confirmed) throw new Error("이미 조기 확정된 종목입니다.");
  const league = await getLeague(entry.league_id);
  if (!league || !(await canEarlyConfirm(league))) throw new Error("조기 확정 가능 기간이 아닙니다.");

  const latest = await latestClose(entry.symbol);
  const before = entry;
  await dbRun(
    `UPDATE league_entries
     SET early_confirm_price = ?, ranking_price = ?, current_price = ?, provider = ?,
         last_price_at = ?, early_confirmed_at = ?, early_confirmed = 1, updated_at = ?
     WHERE id = ?`,
    [latest.price, latest.price, latest.price, latest.provider, latest.at, nowIso(), nowIso(), entryId]
  );
  await insertPriceSnapshot(entryId, latest.price, latest.provider, latest.at);
  const after = await dbGet<LeagueEntry>("SELECT * FROM league_entries WHERE id = ?", [entryId]);
  await audit(user.id, "update", "league_entries", entryId, before, after, "participant early confirm");
  revalidatePath("/");
}

export async function manualPriceAdjustAction(formData: FormData) {
  const admin = await requireAdmin();
  const entryId = value(formData, "entryId");
  const price = Number(value(formData, "price"));
  const reason = value(formData, "reason");
  if (!Number.isFinite(price) || price <= 0) throw new Error("가격이 올바르지 않습니다.");
  if (!reason) throw new Error("변경 사유가 필요합니다.");
  const before = await dbGet<LeagueEntry>("SELECT * FROM league_entries WHERE id = ?", [entryId]);
  if (!before) throw new Error("보정할 종목을 찾을 수 없습니다.");
  const league = await getLeague(before.league_id);
  const currentTime = (await getDebugNow()).toISOString();
  const isEnded = league ? league.ends_at <= currentTime : false;
  const needsStartingPrice = Boolean(league && !isEnded && league.starts_at <= currentTime && before.start_price_finalized_at == null);

  if (isEnded && league) {
    await dbRun(
      `UPDATE league_entries
       SET end_price = ?, current_price = ?, ranking_price = ?, provider = 'admin-manual',
           last_price_at = ?, ended_at = ?, manual_price_required = 0, updated_at = ?
       WHERE id = ?`,
      [price, price, price, nowIso(), league.ends_at, nowIso(), entryId]
    );
  } else if (needsStartingPrice && league) {
    await dbRun("DELETE FROM price_snapshots WHERE league_entry_id = ? AND captured_at < ?", [entryId, league.starts_at]);
    await dbRun(
      `UPDATE league_entries
       SET start_price = ?, current_price = ?, provider = 'admin-manual',
           last_price_at = ?, start_price_finalized_at = ?, manual_price_required = 0, updated_at = ?
       WHERE id = ?`,
      [price, price, nowIso(), nowIso(), nowIso(), entryId]
    );
  } else {
    await dbRun(
      `UPDATE league_entries
       SET current_price = ?, provider = 'admin-manual',
           last_price_at = ?, manual_price_required = 0, updated_at = ?
       WHERE id = ?`,
      [price, nowIso(), nowIso(), entryId]
    );
  }
  await insertPriceSnapshot(entryId, price, "admin-manual", isEnded && league ? league.ends_at : needsStartingPrice && league ? league.starts_at : undefined);
  const after = await dbGet<LeagueEntry>("SELECT * FROM league_entries WHERE id = ?", [entryId]);
  await audit(admin.id, "manual_price_adjust", "league_entries", entryId, before, after, reason);
  revalidatePath("/admin");
  revalidatePath("/");
}

export async function seedDebugDataAction() {
  const admin = await requireAdmin();
  await seedDebugData(admin.id);
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/rankings");
  revalidatePath("/leagues");
  revalidatePath("/settings");
}

export async function deleteDebugDataAction() {
  const admin = await requireAdmin();
  await deleteDebugData(admin.id);
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/debug");
  revalidatePath("/rankings");
  revalidatePath("/leagues");
  revalidatePath("/settings");
}

export async function setDebugNowAction(formData: FormData) {
  await requireAdmin();
  const now = value(formData, "now");
  const iso = new Date(now).toISOString();
  await dbRun(
    `INSERT INTO debug_state (key, value, updated_at)
     VALUES ('now', ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [iso, nowIso()]
  );
  revalidatePath("/");
  revalidatePath("/admin/debug");
  revalidatePath("/settings");
}

export async function setProviderFailureAction(formData: FormData) {
  await requireAdmin();
  const provider = value(formData, "provider");
  const enabled = formData.get("enabled") === "on" ? "1" : "0";
  if (!["naver", "investing", "yahoo"].includes(provider)) throw new Error("알 수 없는 provider입니다.");
  await dbRun(
    `INSERT INTO debug_state (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [`fail.${provider}`, enabled, nowIso()]
  );
  revalidatePath("/admin/debug");
}
