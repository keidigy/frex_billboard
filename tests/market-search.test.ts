import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeNaverSearchItems,
  normalizeYahooAutocompleteItems,
} from "../src/lib/market/search-normalization.ts";

test("normalizeNaverSearchItems keeps Korean name search results and filters leveraged products", () => {
  const results = normalizeNaverSearchItems([
    {
      code: "005930",
      name: "삼성전자",
      typeCode: "KOSPI",
      typeName: "코스피",
      url: "/domestic/stock/005930/total",
      nationCode: "KOR",
    },
    {
      code: "0193W0",
      name: "KODEX 삼성전자단일종목레버리지",
      typeCode: "KOSPI",
      typeName: "코스피",
      url: "/domestic/stock/0193W0/total",
      nationCode: "KOR",
    },
  ]);

  assert.deepEqual(
    results.map((item) => item.symbol),
    ["005930"]
  );
  assert.equal(results[0].name, "삼성전자");
  assert.equal(results[0].market, "KR");
  assert.equal(results[0].currency, "KRW");
});

test("normalizeNaverSearchItems maps US tickers from Naver search", () => {
  const results = normalizeNaverSearchItems([
    {
      code: "AAPL",
      name: "애플",
      typeCode: "NASDAQ",
      typeName: "나스닥 증권거래소",
      url: "/worldstock/stock/AAPL.O/total",
      nationCode: "USA",
    },
  ]);

  assert.equal(results[0].symbol, "AAPL");
  assert.equal(results[0].market, "US");
  assert.equal(results[0].currency, "USD");
});

test("normalizeYahooAutocompleteItems keeps primary US equity and filters options", () => {
  const results = normalizeYahooAutocompleteItems([
    { symbol: "AAPL", name: "Apple Inc.", exch: "NMS", exchDisp: "NASDAQ", type: "S", typeDisp: "Equity" },
    { symbol: "IEWQ.SW", name: "AAPL Sep 2026 150.000 put", exch: "EBS", exchDisp: "Swiss", type: "E", typeDisp: "ETF" },
  ]);

  assert.deepEqual(
    results.map((item) => item.symbol),
    ["AAPL"]
  );
  assert.equal(results[0].source, "yahoo-autocomplete");
});
