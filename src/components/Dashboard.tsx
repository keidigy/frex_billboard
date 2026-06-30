import { earlyConfirmAction } from "@/lib/actions";
import { formatDateTime, formatMoney, formatPct, leagueTypeLabel } from "@/lib/format";
import { canEarlyConfirm, canRegister, getDashboardRowsForLeague, getPriceSeries, getRankedEntriesForLeague, getRebalancedPortfolioIndex, getVisibleLeagues } from "@/lib/leagues";
import type { User } from "@/lib/types";
import { LineChart } from "@/components/LineChart";

function rowClass(rank: number) {
  if (rank === 1) return "rank gold";
  if (rank === 2) return "rank silver";
  if (rank === 3) return "rank bronze";
  return "";
}

export function Dashboard({ user }: { user: User }) {
  const leagues = getVisibleLeagues();
  const portfolio = getRebalancedPortfolioIndex();

  return (
    <>
      <section className="hero-row">
        <div>
          <p className="eyebrow">Season 3 · 2026 H2</p>
          <h1>대시보드</h1>
          <p className="subtle">현재 열려 있거나 진행 중인 단기, 중기, 장기 리그 순위와 수익률 추이를 보여줍니다.</p>
        </div>
        <div className="index-box">
          <span>Normalized Portfolio Index</span>
          <strong>{portfolio.toFixed(2)}</strong>
          <small>동일 비중 1000 · 리밸런싱 반영</small>
        </div>
      </section>

      <section className="dashboard-grid">
        {leagues.map((league) => {
          const ranked = getRankedEntriesForLeague(league.id);
          const dashboardRows = getDashboardRowsForLeague(league);
          const registerOpen = canRegister(league);
          const earlyOpen = canEarlyConfirm(league);
          const chartSeries = ranked.slice(0, 5).map((entry) => ({
            label: entry.real_name,
            values: getPriceSeries(entry.id).map((point) => ({
              date: point.date,
              close: point.close,
              currency: entry.currency,
              value: ((point.close - entry.start_price) / entry.start_price) * 100,
            })),
          }));

          return (
            <article className="league-panel" key={league.id}>
              <div className="panel-head">
                <div>
                  <p className="eyebrow">{league.name}</p>
                  <h2>{leagueTypeLabel(league.league_type)} 리그</h2>
                </div>
                <span className={registerOpen ? "status open" : "status"}>
                  {registerOpen ? "등록 가능" : earlyOpen ? "확정 가능" : "진행/대기"}
                </span>
              </div>
              <div className="meta-grid">
                <span>시작 {formatDateTime(league.starts_at)}</span>
                <span>종료 {formatDateTime(league.ends_at)}</span>
              </div>

              <div className="table-scroll">
                <table className="dashboard-table">
                  <thead>
                    <tr>
                      <th>순위</th>
                      <th>사용자</th>
                      <th>종목</th>
                      <th>시작금액</th>
                      <th>현재금액</th>
                      <th>수익률</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {dashboardRows.map((row) => {
                      if (row.kind === "inactive") {
                        return (
                          <tr key={`${league.id}-${row.user_id}`} className="inactive-rank">
                            <td>-</td>
                            <td>{row.real_name}</td>
                            <td className="stock-cell muted-stock">
                              <strong>{row.status}</strong>
                              <small>{row.status === "실격" ? "종목 미등록" : "등록 대기"}</small>
                            </td>
                            <td>-</td>
                            <td>-</td>
                            <td>-</td>
                            <td />
                          </tr>
                        );
                      }

                      const entry = row.entry;
                      return (
                        <tr key={entry.id} className={rowClass(entry.rank)}>
                          <td>{entry.rank}</td>
                          <td>{entry.real_name}</td>
                          <td className="stock-cell" title={`${entry.stock_name} (${entry.symbol})`}>
                            <strong>{entry.stock_name}</strong>
                            <small>
                              {entry.symbol} · {entry.currency}
                            </small>
                          </td>
                          <td>{formatMoney(entry.start_price, entry.currency)}</td>
                          <td>{formatMoney(entry.basisPrice, entry.currency)}</td>
                          <td className={entry.returnPct >= 0 ? "up" : "down"}>{formatPct(entry.returnPct)}</td>
                          <td>
                            {earlyOpen && entry.user_id === user.id && entry.early_confirmed === 0 ? (
                              <form action={earlyConfirmAction}>
                                <input type="hidden" name="entryId" value={entry.id} />
                                <button className="small-button" type="submit">
                                  확정
                                </button>
                              </form>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                    {dashboardRows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="empty-cell">
                          아직 승인된 참가자가 없습니다.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              <LineChart series={chartSeries} />
            </article>
          );
        })}
      </section>
    </>
  );
}
