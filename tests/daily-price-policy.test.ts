import test from "node:test";
import assert from "node:assert/strict";
import { captureWindowStart, kstDateKey, selectMissingTradingCloses } from "../src/lib/daily-price-policy.ts";

test("kstDateKey groups snapshots by Korean calendar day", () => {
  assert.equal(kstDateKey("2026-07-01T14:59:00.000Z"), "2026-07-01");
  assert.equal(kstDateKey("2026-07-01T15:00:00.000Z"), "2026-07-02");
});

test("captureWindowStart overlaps the previous close without moving before league start", () => {
  assert.equal(
    captureWindowStart("2026-07-01T00:00:00.000Z", "2026-07-10T00:00:00.000Z"),
    "2026-07-08T00:00:00.000Z"
  );
  assert.equal(
    captureWindowStart("2026-07-01T00:00:00.000Z", "2026-07-02T00:00:00.000Z"),
    "2026-07-01T00:00:00.000Z"
  );
});

test("selectMissingTradingCloses inserts only new trading-day closes", () => {
  const missing = selectMissingTradingCloses(
    [
      { date: "2026-07-03T00:00:00.000Z", close: 100 },
      { date: "2026-07-06T00:00:00.000Z", close: 104 },
      { date: "2026-07-06T01:00:00.000Z", close: 105 },
      { date: "2026-07-07T00:00:00.000Z", close: Number.NaN },
      { date: "2026-07-08T00:00:00.000Z", close: 108 },
    ],
    [{ date: "2026-07-03T10:00:00.000Z" }],
    "2026-07-01T00:00:00.000Z",
    "2026-07-07T23:59:59.000Z"
  );

  assert.deepEqual(missing, [{ date: "2026-07-06T00:00:00.000Z", close: 104 }]);
});
