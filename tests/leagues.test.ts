import test from "node:test";
import assert from "node:assert/strict";
import { entryBasisPrice, type EntryBasisState } from "../src/lib/entry-basis.ts";
import { isRegistrationOpenAt } from "../src/lib/league-registration.ts";

function entry(overrides: Partial<EntryBasisState>): EntryBasisState {
  return {
    start_price: 100,
    end_price: null,
    early_confirm_price: null,
    ranking_price: null,
    current_price: 100,
    ended_at: null,
    early_confirmed: 0,
    ...overrides,
  };
}

test("entryBasisPrice uses current price for active entries even if stale ranking price exists", () => {
  const basis = entryBasisPrice(
    entry({
      ranking_price: 90,
      current_price: 120,
    })
  );

  assert.equal(basis, 120);
});

test("entryBasisPrice keeps early-confirmed and ended entries fixed", () => {
  assert.equal(
    entryBasisPrice(entry({ early_confirmed: 1, early_confirm_price: 110, ranking_price: 110, current_price: 140 })),
    110
  );
  assert.equal(
    entryBasisPrice(entry({ end_price: 105, ranking_price: 105, current_price: 80, ended_at: "2026-08-01T00:00:00.000Z" })),
    105
  );
});

test("registration window stays open for the next short league while the current one is active", () => {
  const now = "2026-07-29T10:00:00.000Z";
  const activeJulyShortLeague = {
    registration_opens_at: "2026-06-23T20:00:00.000Z",
    starts_at: "2026-06-30T20:00:00.000Z",
  };
  const upcomingAugustShortLeague = {
    registration_opens_at: "2026-07-24T20:00:00.000Z",
    starts_at: "2026-07-31T20:00:00.000Z",
  };

  assert.equal(isRegistrationOpenAt(activeJulyShortLeague, now), false);
  assert.equal(isRegistrationOpenAt(upcomingAugustShortLeague, now), true);
});
