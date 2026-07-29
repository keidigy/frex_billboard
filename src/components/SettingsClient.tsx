"use client";

import { useMemo, useState, useTransition } from "react";
import { registerLeagueEntryAction } from "@/lib/actions";
import type { League, SymbolSearchResult } from "@/lib/types";

export function SettingsClient({ leagues }: { leagues: League[] }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SymbolSearchResult[]>([]);
  const [selected, setSelected] = useState<SymbolSearchResult | null>(null);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const defaultLeagueId = useMemo(() => leagues[0]?.id ?? "", [leagues]);

  async function search() {
    const trimmed = query.trim();
    setSearched(true);
    setSelected(null);
    if (trimmed.length < 2) {
      setResults([]);
      setError("검색어는 2글자 이상 입력해 주세요.");
      return;
    }

    try {
      setError(null);
      const res = await fetch(`/api/markets/search?q=${encodeURIComponent(trimmed)}`);
      const data = (await res.json()) as { results: SymbolSearchResult[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "검색 요청이 실패했습니다.");
      setResults(data.results ?? []);
    } catch (searchError) {
      setResults([]);
      setError(searchError instanceof Error ? searchError.message : "검색 요청이 실패했습니다.");
    }
  }

  return (
    <section className="two-column">
      <article className="card">
        <h2>리그별 종목 등록</h2>
        <p className="subtle">등록 가능 기간에는 같은 리그에서 본인 종목을 제한 없이 수정할 수 있습니다.</p>
        <div className="search-row">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                startTransition(search);
              }
            }}
            placeholder="종목명 또는 티커"
          />
          <button type="button" onClick={() => startTransition(search)} disabled={isPending}>
            검색
          </button>
        </div>
        {error ? <p className="inline-error">{error}</p> : null}
        {searched && !error && results.length === 0 ? <p className="empty">검색 결과가 없습니다.</p> : null}
        <div className="result-list">
          {results.map((item) => (
            <button key={`${item.source}-${item.symbol}`} type="button" className={selected?.symbol === item.symbol ? "result selected" : "result"} onClick={() => setSelected(item)}>
              <strong>{item.displaySymbol}</strong>
              <span>{item.name}</span>
              <small>
                {item.market} · {item.currency} · {item.source}
              </small>
            </button>
          ))}
        </div>
      </article>

      <article className="card">
        <h2>선택 종목 등록</h2>
        <form action={registerLeagueEntryAction} className="form-stack">
          <label>
            리그
            <select name="leagueId" defaultValue={defaultLeagueId}>
              {leagues.map((league) => (
                <option key={league.id} value={league.id}>
                  {league.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            종목명
            <input name="stockName" value={selected?.name ?? ""} onChange={() => undefined} required />
          </label>
          <label>
            종목코드
            <input name="symbol" value={selected?.symbol ?? ""} onChange={() => undefined} required />
          </label>
          <input type="hidden" name="market" value={selected?.market ?? "US"} />
          <input type="hidden" name="currency" value={selected?.currency ?? "USD"} />
          <label>
            실제 가격 조회 실패 시 시작가
            <input name="startPrice" type="number" min="0" step="0.01" placeholder="fallback only" />
          </label>
          <label>
            등록 사유
            <textarea name="reason" rows={5} placeholder="중기/장기는 20byte 이상 필수" />
          </label>
          <button type="submit" disabled={!selected}>
            등록/수정
          </button>
        </form>
      </article>
    </section>
  );
}
