import test from "node:test";
import assert from "node:assert/strict";
import {
  captureWindowStart,
  kstDateKey,
  selectMissingTradingCloses,
  shouldCaptureDailyPrice,
  shouldFinalizeStartingPrice,
} from "../src/lib/daily-price-policy.ts";

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

const activeEntry = {
  league_starts_at: "2026-07-31T15:00:00.000Z",
  league_ends_at: "2026-08-31T15:00:00.000Z",
  ended_at: null,
  early_confirmed: 0,
  manual_price_required: 0,
  disqualified: 0,
  start_price_finalized_at: null,
};

test("new entries finalize their starting price once the league has started", () => {
  assert.equal(shouldFinalizeStartingPrice(activeEntry, "2026-07-31T14:59:59.000Z"), false);
  assert.equal(shouldFinalizeStartingPrice(activeEntry, "2026-07-31T20:00:00.000Z"), true);
  assert.equal(shouldFinalizeStartingPrice(activeEntry, "2026-08-31T15:00:00.000Z"), false);
});

test("daily price capture skips entries until their start price is final and forever after league end", () => {
  const finalized = { ...activeEntry, start_price_finalized_at: "2026-07-31T20:00:00.000Z" };
  assert.equal(shouldCaptureDailyPrice(finalized, "2026-08-01T20:00:00.000Z"), true);
  assert.equal(shouldCaptureDailyPrice(finalized, "2026-08-31T15:00:00.000Z"), false);
  assert.equal(shouldCaptureDailyPrice({ ...finalized, ended_at: "2026-08-31T15:00:00.000Z" }, "2026-08-30T20:00:00.000Z"), false);
});
