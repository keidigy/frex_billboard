export type NormalizedSearchResult = {
  symbol: string;
  displaySymbol: string;
  name: string;
  market: "KR" | "US";
  exchange: string;
  currency: "KRW" | "USD";
  type: "stock" | "etf";
  marketCap: number | null;
  source: string;
};

export type NaverSearchItem = {
  code?: string;
  name?: string;
  typeCode?: string;
  typeName?: string;
  url?: string;
  nationCode?: string;
};

export type YahooAutocompleteItem = {
  symbol?: string;
  name?: string;
  exch?: string;
  exchDisp?: string;
  type?: string;
  typeDisp?: string;
};

const usYahooExchanges = new Set(["NMS", "NYQ", "NAS", "ASE", "NGM", "NCM", "BTS", "PCX"]);
const krYahooExchanges = new Set(["KSC", "KOE", "KOS", "KQ"]);

export function isLeveragedOrInverse(name: string) {
  return /\b(leveraged|inverse|ultra|bear|bull|2x|3x|short)\b|레버리지|인버스/i.test(name);
}

export function isUnsupportedDerivative(name: string) {
  return /\b(call|put|option|warrant|rights)\b|콜|풋|워런트|선물/i.test(name);
}

export function isAllowedSearchName(name: string) {
  return !isLeveragedOrInverse(name) && !isUnsupportedDerivative(name);
}

function naverType(item: NaverSearchItem): "stock" | "etf" {
  const name = item.name ?? "";
  if (item.url?.includes("/etf/") || /\bETF\b|KODEX|TIGER|ACE|RISE|PLUS|SOL|KOSEF|HANARO|KBSTAR|TIMEFOLIO/i.test(name)) {
    return "etf";
  }
  return "stock";
}

export function normalizeNaverSearchItems(items: NaverSearchItem[]) {
  return items
    .map((item): NormalizedSearchResult | null => {
      if (!item.code || !item.name || !isAllowedSearchName(item.name)) return null;

      if (item.nationCode === "KOR") {
        if (!/^\d{6}$/.test(item.code)) return null;
        return {
          symbol: item.code,
          displaySymbol: item.code,
          name: item.name,
          market: "KR",
          exchange: item.typeName ?? item.typeCode ?? "KRX",
          currency: "KRW",
          type: naverType(item),
          marketCap: null,
          source: "naver",
        };
      }

      if (item.nationCode === "USA") {
        if (!/^[A-Z][A-Z0-9.-]{0,14}$/i.test(item.code)) return null;
        return {
          symbol: item.code.toUpperCase(),
          displaySymbol: item.code.toUpperCase(),
          name: item.name,
          market: "US",
          exchange: item.typeName ?? item.typeCode ?? "US",
          currency: "USD",
          type: naverType(item),
          marketCap: null,
          source: "naver",
        };
      }

      return null;
    })
    .filter((item): item is NormalizedSearchResult => Boolean(item));
}

function yahooMarket(item: YahooAutocompleteItem): "KR" | "US" | null {
  const exch = item.exch ?? "";
  const exchDisp = item.exchDisp ?? "";
  const symbol = item.symbol ?? "";
  if (symbol.endsWith(".KS") || symbol.endsWith(".KQ") || krYahooExchanges.has(exch) || exchDisp.includes("Korea")) return "KR";
  if (usYahooExchanges.has(exch)) return "US";
  return null;
}

export function normalizeYahooAutocompleteItems(items: YahooAutocompleteItem[]) {
  return items
    .map((item): NormalizedSearchResult | null => {
      if (!item.symbol || !item.name || !isAllowedSearchName(item.name)) return null;
      const market = yahooMarket(item);
      if (!market) return null;
      const type = item.type === "E" || item.typeDisp?.toLowerCase().includes("etf") ? "etf" : "stock";

      return {
        symbol: item.symbol.toUpperCase(),
        displaySymbol: item.symbol.replace(/\.(KS|KQ)$/i, "").toUpperCase(),
        name: item.name,
        market,
        exchange: item.exchDisp ?? item.exch ?? (market === "KR" ? "KRX" : "US"),
        currency: market === "KR" ? "KRW" : "USD",
        type,
        marketCap: null,
        source: "yahoo-autocomplete",
      };
    })
    .filter((item): item is NormalizedSearchResult => Boolean(item));
}
