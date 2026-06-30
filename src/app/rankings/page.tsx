import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getCurrentUser } from "@/lib/auth";
import { countUsers } from "@/lib/db";
import { finalizeEndedLeagues } from "@/lib/leagues";
import { getHistoricalRankings, type HistoricalRankingMode } from "@/lib/rankings";

export const dynamic = "force-dynamic";

export default async function RankingsPage({ searchParams }: { searchParams: Promise<{ mode?: HistoricalRankingMode }> }) {
  if (countUsers().count === 0) redirect("/setup");
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await finalizeEndedLeagues();
  const params = await searchParams;
  const mode = params.mode === "score" ? "score" : "medal";
  const rows = getHistoricalRankings(mode);

  return (
    <AppShell user={user}>
      <section className="hero-row">
        <div>
          <p className="eyebrow">History</p>
          <h1>역대 순위표</h1>
        </div>
        <div className="segmented">
          <Link className={mode === "medal" ? "active" : ""} href="/rankings?mode=medal">
            순위순
          </Link>
          <Link className={mode === "score" ? "active" : ""} href="/rankings?mode=score">
            점수순
          </Link>
        </div>
      </section>
      <article className="card">
        <div className="table-scroll rankings-table-wrap">
          <table>
            <thead>
              <tr>
                <th>순위</th>
                <th>사용자</th>
                <th>1등</th>
                <th>2등</th>
                <th>3등</th>
                <th>
                  <span className="score-heading">
                    점수
                    <span
                      className="help-tooltip"
                      tabIndex={0}
                      aria-label="점수 산정 방식"
                      data-tooltip="1등 9점, 2등 8점, ... 8등 2점, 9등 이하는 1점. 장기 리그는 6배, 중기 리그는 3배, 단기 리그는 1배. 미참여 또는 실격은 0점. 동점은 같은 순위로 처리합니다."
                    >
                      ❓
                    </span>
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.userId}>
                  <td>{row.rank}</td>
                  <td>{row.realName}</td>
                  <td>{row.firsts}</td>
                  <td>{row.seconds}</td>
                  <td>{row.thirds}</td>
                  <td>{row.score}</td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty-cell">
                    집계 가능한 리그 결과가 없습니다.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </article>
    </AppShell>
  );
}
