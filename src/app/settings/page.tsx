import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { SettingsClient } from "@/components/SettingsClient";
import { changePasswordAction, type RegisterLeagueEntryState } from "@/lib/actions";
import { getCurrentUser, redirectIfPasswordResetRequired } from "@/lib/auth";
import { countUsers } from "@/lib/db";
import { getRegistrableLeagues } from "@/lib/leagues";

export const dynamic = "force-dynamic";

type SettingsSearchParams = {
  entryStatus?: string;
  leagueName?: string;
  stockName?: string;
  symbol?: string;
  startPrice?: string;
  provider?: string;
  manualPriceRequired?: string;
  submittedAt?: string;
};

function initialRegistrationState(params: SettingsSearchParams): RegisterLeagueEntryState {
  const action = params.entryStatus === "updated" ? "updated" : params.entryStatus === "created" ? "created" : null;
  if (!action) return { ok: false };

  const startPrice = Number(params.startPrice);
  return {
    ok: true,
    action,
    leagueName: params.leagueName,
    stockName: params.stockName,
    symbol: params.symbol,
    startPrice: Number.isFinite(startPrice) ? startPrice : undefined,
    provider: params.provider,
    manualPriceRequired: params.manualPriceRequired === "1",
    submittedAt: params.submittedAt,
  };
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<SettingsSearchParams>;
}) {
  if ((await countUsers()).count === 0) redirect("/setup");
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  redirectIfPasswordResetRequired(user);
  const params = await searchParams;
  const leagues = await getRegistrableLeagues();

  return (
    <AppShell user={user}>
      <section className="hero-row">
        <div>
          <p className="eyebrow">Custom</p>
          <h1>설정 및 종목 등록</h1>
          <p className="subtle">비밀번호를 변경하고 등록 가능한 리그의 종목을 선택합니다.</p>
        </div>
      </section>

      <section className="two-column">
        <article className="card">
          <h2>비밀번호 변경</h2>
          <form action={changePasswordAction} className="form-stack">
            <label>
              현재 비밀번호
              <input name="currentPassword" type="password" required />
            </label>
            <label>
              새 비밀번호
              <input name="newPassword" type="password" minLength={8} required />
            </label>
            <label>
              새 비밀번호 확인
              <input name="newPasswordConfirm" type="password" minLength={8} required />
            </label>
            <button type="submit">변경</button>
          </form>
        </article>
        <article className="card">
          <h2>등록 가능 리그</h2>
          {leagues.length ? (
            <ul className="plain-list">
              {leagues.map((league) => (
                <li key={league.id}>
                  <strong>{league.name}</strong>
                  <span>{league.starts_at}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">현재 등록 가능한 리그가 없습니다.</p>
          )}
        </article>
      </section>

      {leagues.length ? <SettingsClient leagues={leagues} initialRegisterState={initialRegistrationState(params)} /> : null}
    </AppShell>
  );
}
