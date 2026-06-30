import type { Currency, PricePoint, SymbolSearchResult } from "@/lib/types";

export type PriceProvider = {
  name: string;
  searchSymbols(query: string): Promise<SymbolSearchResult[]>;
  getHistoricalCloses(symbol: string, from: Date, to: Date): Promise<PricePoint[]>;
  getLatestClose(symbol: string): Promise<{ price: number; currency: Currency; at: string }>;
};

function unixSeconds(date: Date) {
  return Math.floor(date.getTime() / 1000);
}

function normalizeYahooSymbol(symbol: string) {
  if (/^\d{6}$/.test(symbol)) return `${symbol}.KS`;
  return symbol.toUpperCase();
}

function inferMarket(symbol: string, exchange: string) {
  if (symbol.endsWith(".KS") || symbol.endsWith(".KQ") || exchange.includes("Korea")) return "KR";
  return "US";
}

function inferCurrency(symbol: string, currency?: string): Currency {
  if (currency === "KRW" || symbol.endsWith(".KS") || symbol.endsWith(".KQ")) return "KRW";
  return "USD";
}

function isLeveragedOrInverse(name: string) {
  return /\b(leveraged|inverse|ultra|bear|bull|2x|3x|short)\b|레버리지|인버스/i.test(name);
}

function isEligible(item: SymbolSearchResult) {
  if (isLeveragedOrInverse(item.name)) return false;
  if (item.type === "etf") return true;
  if (item.market === "KR") return (item.marketCap ?? 0) >= 1_000_000_000_000;
  return (item.marketCap ?? 0) >= 1_000_000_000;
}

type InvestingQuote = {
  pair_ID?: number | string;
  pairId?: number | string;
  symbol?: string;
  name?: string;
  exchange?: string;
  pair_type?: string;
};

async function investingSearchRaw(query: string) {
  const url = `https://www.investing.com/search/service/search?search_text=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 FrexBillboard/0.1",
      "X-Requested-With": "XMLHttpRequest",
    },
    next: { revalidate: 60 * 30 },
  });
  if (!res.ok) throw new Error(`Investing search failed: ${res.status}`);
  const data = (await res.json()) as { quotes?: InvestingQuote[] };
  return data.quotes ?? [];
}

async function investingPairId(symbol: string) {
  const quotes = await investingSearchRaw(symbol);
  const normalized = symbol.replace(/\.(KS|KQ)$/i, "").toUpperCase();
  const quote =
    quotes.find((item) => item.symbol?.toUpperCase() === normalized) ??
    quotes.find((item) => item.symbol?.toUpperCase().includes(normalized));
  const pairId = quote?.pair_ID ?? quote?.pairId;
  if (!pairId) throw new Error("Investing pair id unavailable");
  return String(pairId);
}

function yyyyMmDd(date: Date) {
  return date.toISOString().slice(0, 10);
}

export const yahooProvider: PriceProvider = {
  name: "yahoo",
  async searchSymbols(query) {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
      query
    )}&quotesCount=12&newsCount=0`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 FrexBillboard/0.1",
      },
      next: { revalidate: 60 * 30 },
    });
    if (!res.ok) throw new Error(`Yahoo search failed: ${res.status}`);
    const data = (await res.json()) as {
      quotes?: Array<{
        symbol?: string;
        shortname?: string;
        longname?: string;
        quoteType?: string;
        exchange?: string;
        exchDisp?: string;
        currency?: string;
        marketCap?: number;
      }>;
    };

    return (data.quotes ?? [])
      .filter((quote) => quote.symbol && quote.quoteType)
      .map((quote) => {
        const symbol = quote.symbol!;
        const exchange = quote.exchDisp ?? quote.exchange ?? "";
        const type = quote.quoteType === "ETF" ? "etf" : "stock";
        return {
          symbol,
          displaySymbol: symbol.replace(/\.(KS|KQ)$/i, ""),
          name: quote.longname ?? quote.shortname ?? symbol,
          market: inferMarket(symbol, exchange),
          exchange,
          currency: inferCurrency(symbol, quote.currency),
          type,
          marketCap: quote.marketCap ?? null,
          source: "yahoo",
        } satisfies SymbolSearchResult;
      })
      .filter((item) => item.type === "stock" || item.type === "etf")
      .filter(isEligible);
  },
  async getHistoricalCloses(symbol, from, to) {
    const normalized = normalizeYahooSymbol(symbol);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      normalized
    )}?period1=${unixSeconds(from)}&period2=${unixSeconds(to)}&interval=1d&events=history`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 FrexBillboard/0.1",
      },
      next: { revalidate: 60 * 30 },
    });
    if (!res.ok) throw new Error(`Yahoo chart failed: ${res.status}`);
    const data = (await res.json()) as {
      chart?: {
        result?: Array<{
          timestamp?: number[];
          indicators?: { quote?: Array<{ close?: Array<number | null> }> };
        }>;
        error?: unknown;
      };
    };
    const result = data.chart?.result?.[0];
    const timestamps = result?.timestamp ?? [];
    const closes = result?.indicators?.quote?.[0]?.close ?? [];
    return timestamps
      .map((timestamp, index) => ({ date: new Date(timestamp * 1000).toISOString(), close: closes[index] }))
      .filter((point): point is PricePoint => typeof point.close === "number" && Number.isFinite(point.close));
  },
  async getLatestClose(symbol) {
    const points = await this.getHistoricalCloses(
      symbol,
      new Date(Date.now() - 1000 * 60 * 60 * 24 * 14),
      new Date(Date.now() + 1000 * 60 * 60 * 24)
    );
    const latest = points.at(-1);
    if (!latest) throw new Error("Yahoo latest close unavailable");
    return { price: latest.close, currency: inferCurrency(normalizeYahooSymbol(symbol)), at: latest.date };
  },
};

export const naverProvider: PriceProvider = {
  name: "naver",
  async searchSymbols(query) {
    if (!/^\d{4,6}$/.test(query.trim())) return [];
    const price = await this.getLatestClose(query.trim().padStart(6, "0"));
    return [
      {
        symbol: query.trim().padStart(6, "0"),
        displaySymbol: query.trim().padStart(6, "0"),
        name: `KRX ${query.trim().padStart(6, "0")}`,
        market: "KR",
        exchange: "KRX",
        currency: price.currency,
        type: "stock",
        marketCap: null,
        source: "naver",
      },
    ];
  },
  async getHistoricalCloses(symbol, from, to) {
    const numericSymbol = symbol.replace(/\.(KS|KQ)$/i, "");
    if (!/^\d{6}$/.test(numericSymbol)) throw new Error("Naver supports Korean numeric symbols only");
    const startTime = from.toISOString().slice(0, 10).replaceAll("-", "");
    const endTime = to.toISOString().slice(0, 10).replaceAll("-", "");
    const url = `https://api.finance.naver.com/siseJson.naver?symbol=${numericSymbol}&requestType=1&startTime=${startTime}&endTime=${endTime}&timeframe=day`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 FrexBillboard/0.1",
        Referer: "https://finance.naver.com/",
      },
      next: { revalidate: 60 * 30 },
    });
    if (!res.ok) throw new Error(`Naver chart failed: ${res.status}`);
    const text = await res.text();
    const rows = JSON.parse(text.replace(/'/g, '"')) as Array<Array<string | number>>;
    return rows
      .slice(1)
      .map((row) => {
        const yyyymmdd = String(row[0]);
        return {
          date: new Date(`${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}T00:00:00+09:00`).toISOString(),
          close: Number(row[4]),
        };
      })
      .filter((point) => Number.isFinite(point.close));
  },
  async getLatestClose(symbol) {
    const points = await this.getHistoricalCloses(
      symbol,
      new Date(Date.now() - 1000 * 60 * 60 * 24 * 14),
      new Date(Date.now() + 1000 * 60 * 60 * 24)
    );
    const latest = points.at(-1);
    if (!latest) throw new Error("Naver latest close unavailable");
    return { price: latest.close, currency: "KRW", at: latest.date };
  },
};

export const investingProvider: PriceProvider = {
  name: "investing",
  async searchSymbols(query) {
    return (await investingSearchRaw(query))
      .filter((quote) => quote.symbol && quote.name)
      .slice(0, 8)
      .map((quote) => {
        const isKorea = quote.exchange?.toLowerCase().includes("korea") ?? false;
        return {
          symbol: quote.symbol!,
          displaySymbol: quote.symbol!,
          name: quote.name!,
          market: isKorea ? "KR" : "US",
          exchange: quote.exchange ?? "Investing.com",
          currency: isKorea ? "KRW" : "USD",
          type: quote.pair_type?.toLowerCase().includes("etf") ? "etf" : "stock",
          marketCap: null,
          source: "investing",
        } satisfies SymbolSearchResult;
      })
      .filter((item) => !isLeveragedOrInverse(item.name));
  },
  async getHistoricalCloses(symbol, from, to) {
    const pairId = await investingPairId(symbol);
    const url = `https://api.investing.com/api/financialdata/historical/${pairId}?start-date=${yyyyMmDd(
      from
    )}&end-date=${yyyyMmDd(to)}&time-frame=Daily&add-missing-rows=false`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 FrexBillboard/0.1",
        Origin: "https://www.investing.com",
        Referer: "https://www.investing.com/",
      },
      next: { revalidate: 60 * 30 },
    });
    if (!res.ok) throw new Error(`Investing historical failed: ${res.status}`);
    const data = (await res.json()) as {
      data?: Array<{
        rowDateTimestamp?: number;
        date?: string;
        last_close?: number | string;
        close?: number | string;
      }>;
    };
    return (data.data ?? [])
      .map((row) => {
        const close = Number(row.last_close ?? row.close);
        const date =
          typeof row.rowDateTimestamp === "number"
            ? new Date(row.rowDateTimestamp * 1000).toISOString()
            : new Date(row.date ?? "").toISOString();
        return { date, close };
      })
      .filter((point) => Number.isFinite(point.close) && point.date !== "Invalid Date");
  },
  async getLatestClose(symbol) {
    const points = await this.getHistoricalCloses(
      symbol,
      new Date(Date.now() - 1000 * 60 * 60 * 24 * 14),
      new Date(Date.now() + 1000 * 60 * 60 * 24)
    );
    const latest = points.at(-1);
    if (!latest) throw new Error("Investing latest close unavailable");
    return { price: latest.close, currency: inferCurrency(symbol), at: latest.date };
  },
};

export const providers = [naverProvider, investingProvider, yahooProvider];
