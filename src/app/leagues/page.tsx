import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getCurrentUser } from "@/lib/auth";
import { countUsers } from "@/lib/db";
import { formatMoney, formatPct, leagueTypeLabel } from "@/lib/format";
import { finalizeEndedLeagues, getDashboardRowsForLeague, getStartedLeagues } from "@/lib/leagues";

export const dynamic = "force-dynamic";

export default async function LeaguesPage() {
  if ((await countUsers()).count === 0) redirect("/setup");
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await finalizeEndedLeagues();
  const leagues = await getStartedLeagues();
  const leagueViews = await Promise.all(
    leagues.map(async (league) => ({
      league,
      rows: await getDashboardRowsForLeague(league),
    }))
  );

  return (
    <AppShell user={user}>
      <section className="history-layout">
        <aside className="league-index">
          <h2>리그 인덱스</h2>
          {leagueViews.map(({ league }) => (
            <a key={league.id} href={`#${league.id}`}>
              {league.name}
            </a>
          ))}
        </aside>
        <div className="league-results">
          {leagueViews.map(({ league, rows }) => {
            return (
              <article className="card" id={league.id} key={league.id}>
                <p className="eyebrow">{league.name}</p>
                <h2>{leagueTypeLabel(league.league_type)} 리그 결과</h2>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>순위</th>
                        <th>사용자</th>
                        <th>종목</th>
                        <th>시작금액</th>
                        <th>기준금액</th>
                        <th>수익률</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => {
                        if (row.kind === "inactive") {
                          return (
                            <tr key={`${league.id}-${row.user_id}`} className="inactive-rank">
                              <td>-</td>
                              <td>{row.real_name}</td>
                              <td>
                                {row.status} <small>{row.status === "실격" ? "종목 미등록" : "등록 대기"}</small>
                              </td>
                              <td>-</td>
                              <td>-</td>
                              <td>-</td>
                            </tr>
                          );
                        }

                        const entry = row.entry;
                        return (
                          <tr key={entry.id}>
                            <td>{entry.rank}</td>
                            <td>{entry.real_name}</td>
                            <td>
                              {entry.stock_name} <small>{entry.symbol}</small>
                            </td>
                            <td>{formatMoney(entry.start_price, entry.currency)}</td>
                            <td>{formatMoney(entry.basisPrice, entry.currency)}</td>
                            <td className={entry.returnPct >= 0 ? "up" : "down"}>{formatPct(entry.returnPct)}</td>
                          </tr>
                        );
                      })}
                      {rows.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="empty-cell">
                            아직 승인된 참가자가 없습니다.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </AppShell>
  );
}
