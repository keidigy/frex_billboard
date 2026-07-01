import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { approveUserAction, createInviteCodeAction, deactivateUserAction, manualPriceAdjustAction, rejectUserAction } from "@/lib/actions";
import { getCurrentUser } from "@/lib/auth";
import { countUsers, dbAll } from "@/lib/db";
import { formatDateTime, formatMoney } from "@/lib/format";
import { finalizeEndedLeagues } from "@/lib/leagues";
import type { InviteCode, LeagueEntryWithUser, User } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if ((await countUsers()).count === 0) redirect("/setup");
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");
  await finalizeEndedLeagues();

  const users = await dbAll<User>("SELECT * FROM users ORDER BY created_at DESC");
  const invites = await dbAll<InviteCode>("SELECT * FROM invite_codes ORDER BY issued_at DESC LIMIT 20");
  const entries = await dbAll<LeagueEntryWithUser>(
    `SELECT league_entries.*, users.real_name, users.approval_status
     FROM league_entries
     JOIN users ON users.id = league_entries.user_id
     ORDER BY manual_price_required DESC, updated_at DESC
     LIMIT 30`
  );
  const audits = await dbAll<Record<string, string>>("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 40");

  return (
    <AppShell user={user}>
      <section className="hero-row">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>관리 메뉴</h1>
          <p className="subtle">회원, 초대 코드, 가격 보정, 감사 로그를 관리합니다.</p>
        </div>
        <Link href="/admin/debug" className="button-link">
          Debug Mode
        </Link>
      </section>

      <section className="admin-grid">
        <article className="card">
          <h2>초대 코드 발급</h2>
          <form action={createInviteCodeAction} className="inline-form">
            <input name="days" type="number" min="1" defaultValue={14} aria-label="만료 일수" />
            <button type="submit">발급</button>
          </form>
          <div className="compact-list">
            {invites.map((invite) => (
              <div key={invite.code}>
                <strong>{invite.code}</strong>
                <span>{invite.status}</span>
                <small>{formatDateTime(invite.expires_at)}</small>
              </div>
            ))}
          </div>
        </article>

        <article className="card span-2">
          <h2>회원 승인</h2>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>아이디</th>
                  <th>실명</th>
                  <th>권한</th>
                  <th>승인</th>
                  <th>활성</th>
                  <th>IP 경고</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {users.map((target) => (
                  <tr key={target.id}>
                    <td>{target.id}</td>
                    <td>{target.real_name}</td>
                    <td>{target.role}</td>
                    <td>{target.approval_status}</td>
                    <td>{target.active_status}</td>
                    <td>{target.duplicate_ip_flag ? <span className="warn">중복 IP</span> : "-"}</td>
                    <td className="row-actions">
                      {target.approval_status === "pending" ? (
                        <>
                          <form action={approveUserAction}>
                            <input type="hidden" name="userId" value={target.id} />
                            <button className="small-button" type="submit">
                              approve
                            </button>
                          </form>
                          <form action={rejectUserAction}>
                            <input type="hidden" name="userId" value={target.id} />
                            <button className="small-button danger" type="submit">
                              reject
                            </button>
                          </form>
                        </>
                      ) : null}
                      {target.active_status === "active" && target.id !== user.id ? (
                        <form action={deactivateUserAction}>
                          <input type="hidden" name="userId" value={target.id} />
                          <button className="small-button danger" type="submit">
                            deactivate
                          </button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <section className="two-column">
        <article className="card">
          <h2>가격 수동 보정</h2>
          <div className="compact-list">
            {entries.map((entry) => (
              <form action={manualPriceAdjustAction} key={entry.id} className={entry.manual_price_required ? "adjust-row pending" : "adjust-row"}>
                <input type="hidden" name="entryId" value={entry.id} />
                <div>
                  <strong>
                    {entry.real_name} · {entry.symbol}
                  </strong>
                  <small>
                    현재 {formatMoney(entry.current_price, entry.currency)} · {entry.provider ?? "-"}
                  </small>
                </div>
                <input name="price" type="number" min="0" step="0.01" placeholder="보정가" required />
                <input name="reason" placeholder="변경 사유" required />
                <button type="submit">저장</button>
              </form>
            ))}
          </div>
        </article>

        <article className="card">
          <h2>감사 로그</h2>
          <div className="compact-list audit-list">
            {audits.map((audit) => (
              <div key={audit.id}>
                <strong>
                  {audit.action_type} · {audit.target_table}
                </strong>
                <span>{audit.target_key}</span>
                <small>
                  {audit.actor_id} · {formatDateTime(audit.created_at)}
                </small>
              </div>
            ))}
          </div>
        </article>
      </section>
    </AppShell>
  );
}
