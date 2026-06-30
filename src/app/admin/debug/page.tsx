import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { seedDebugDataAction, setDebugNowAction, setProviderFailureAction } from "@/lib/actions";
import { getCurrentUser } from "@/lib/auth";
import { countUsers, getDb } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { getDebugNow } from "@/lib/leagues";

export const dynamic = "force-dynamic";

export default async function DebugPage() {
  if (countUsers().count === 0) redirect("/setup");
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");

  const db = getDb();
  const flags = Object.fromEntries(
    (db.prepare("SELECT key, value FROM debug_state").all() as Array<{ key: string; value: string }>).map((row) => [row.key, row.value])
  );
  const now = getDebugNow();

  return (
    <AppShell user={user}>
      <section className="hero-row">
        <div>
          <p className="eyebrow">Admin Debug</p>
          <h1>시뮬레이션</h1>
          <p className="subtle">운영 데이터와 같은 SQLite에 기록되지만, debug seed/provider failure 상태는 명시적으로 구분됩니다.</p>
        </div>
      </section>

      <section className="debug-grid">
        <article className="card">
          <h2>현재 시각 시뮬레이션</h2>
          <p className="notice">현재 기준: {formatDateTime(now.toISOString())}</p>
          <form action={setDebugNowAction} className="form-stack">
            <label>
              시뮬레이션 시각
              <input name="now" type="datetime-local" defaultValue="2026-06-30T20:00" required />
            </label>
            <button type="submit">적용</button>
          </form>
          <div className="preset-grid">
            {[
              ["2026-06-24T05:00", "시즌3 등록 시작"],
              ["2026-07-01T05:00", "시즌3 시작"],
              ["2026-07-08T05:00", "여러 거래일 경과"],
              ["2026-07-27T05:00", "단기 조기 확정"],
              ["2026-08-01T05:00", "단기 E1 종료"],
              ["2026-12-04T05:00", "장기 조기 확정"],
              ["2027-01-01T05:00", "시즌3 종료"],
            ].map(([date, label]) => (
              <form action={setDebugNowAction} key={date}>
                <input type="hidden" name="now" value={date} />
                <button className="small-button" type="submit">
                  {label}
                </button>
              </form>
            ))}
          </div>
        </article>

        <article className="card">
          <h2>Provider 실패 시뮬레이션</h2>
          {["naver", "investing", "yahoo"].map((provider) => (
            <form action={setProviderFailureAction} key={provider} className="toggle-row">
              <input type="hidden" name="provider" value={provider} />
              <label>
                <input name="enabled" type="checkbox" defaultChecked={flags[`fail.${provider}`] === "1"} />
                {provider} 실패 처리
              </label>
              <button className="small-button" type="submit">
                저장
              </button>
            </form>
          ))}
        </article>

        <article className="card">
          <h2>Seed Data</h2>
          <p className="subtle">approved 멤버 4명, S/M/L 종목, 7일치 일별 종가 스냅샷, 감사 로그를 생성합니다. 데모 계정 비밀번호는 모두 password123입니다.</p>
          <form action={seedDebugDataAction}>
            <button type="submit">debug seed 생성/갱신</button>
          </form>
        </article>

        <article className="card">
          <h2>검증 시나리오</h2>
          <ul className="check-list">
            <li>사용자 DB empty: `/setup`에서 최초 admin 생성</li>
            <li>초대 코드 가입: `/login` 회원 등록 신청 후 admin approve</li>
            <li>중복 IP: 같은 로컬 IP 가입 신청 시 warning flag</li>
            <li>M/L 사유: 20byte 미만이면 등록 거절</li>
            <li>Provider 장애: Naver → Investing → Yahoo → admin 수동 보정</li>
            <li>여러 거래일 경과: debug seed 후 2026-07-08 preset에서 일별 종가 그래프 확인</li>
            <li>조기 확정: debug now를 확정 가능 시점으로 변경 후 대시보드 확인</li>
            <li>종료 박제: 종료 이후 preset 적용 후 대시보드/역대 결과 진입 시 기준가 고정 확인</li>
          </ul>
        </article>
      </section>
    </AppShell>
  );
}
