import test from "node:test";
import assert from "node:assert/strict";
import { buildFinalizationPatch, pickFinalClose } from "../src/lib/finalization.ts";

const baseEntry = {
  early_confirmed: 0,
  early_confirm_price: null,
  end_price: null,
  ranking_price: null,
  current_price: 100,
  provider: "seed",
  last_price_at: "2026-07-01T00:00:00.000Z",
  ended_at: null,
};

test("pickFinalClose uses the latest confirmed close before the league end", () => {
  const close = pickFinalClose(
    [
      { date: "2026-07-30T00:00:00.000Z", close: 101 },
      { date: "2026-07-31T00:00:00.000Z", close: 105 },
      { date: "2026-08-01T01:00:00.000Z", close: 999 },
    ],
    "2026-08-01T00:00:00.000Z"
  );

  assert.deepEqual(close, { date: "2026-07-31T00:00:00.000Z", close: 105 });
});

test("buildFinalizationPatch freezes normal entries with the end close", () => {
  const patch = buildFinalizationPatch(baseEntry, "2026-08-01T00:00:00.000Z", {
    price: 108,
    provider: "yahoo",
    at: "2026-07-31T00:00:00.000Z",
  });

  assert.equal(patch?.endPrice, 108);
  assert.equal(patch?.rankingPrice, 108);
  assert.equal(patch?.currentPrice, 108);
  assert.equal(patch?.endedAt, "2026-08-01T00:00:00.000Z");
});

test("buildFinalizationPatch keeps early-confirmed ranking prices fixed", () => {
  const patch = buildFinalizationPatch(
    {
      ...baseEntry,
      early_confirmed: 1,
      early_confirm_price: 103,
      ranking_price: 103,
      current_price: 110,
      provider: "yahoo",
    },
    "2026-08-01T00:00:00.000Z",
    { price: 90, provider: "yahoo", at: "2026-07-31T00:00:00.000Z" }
  );

  assert.equal(patch?.endPrice, null);
  assert.equal(patch?.rankingPrice, 103);
  assert.equal(patch?.currentPrice, 110);
  assert.equal(patch?.snapshot, null);
});

test("buildFinalizationPatch does not rewrite already archived entries", () => {
  const patch = buildFinalizationPatch(
    {
      ...baseEntry,
      end_price: 108,
      ranking_price: 108,
      ended_at: "2026-08-01T00:00:00.000Z",
    },
    "2026-08-01T00:00:00.000Z",
    { price: 130, provider: "yahoo", at: "2026-08-15T00:00:00.000Z" }
  );

  assert.equal(patch, null);
});
