import test from "node:test";
import assert from "node:assert/strict";
import { calculateRebalancedPortfolioIndex } from "../src/lib/portfolio.ts";

test("portfolio index compounds each league type through episode rebalancing", () => {
  const index = calculateRebalancedPortfolioIndex([
    { leagueType: "S", startsAt: "2026-07-01T00:00:00.000Z", factor: 1.1 },
    { leagueType: "S", startsAt: "2026-08-01T00:00:00.000Z", factor: 0.9 },
    { leagueType: "M", startsAt: "2026-07-01T00:00:00.000Z", factor: 1.2 },
  ]);

  assert.equal(index, 1095);
});

test("portfolio index sorts segments by date before compounding", () => {
  const index = calculateRebalancedPortfolioIndex([
    { leagueType: "S", startsAt: "2026-08-01T00:00:00.000Z", factor: 0.9 },
    { leagueType: "S", startsAt: "2026-07-01T00:00:00.000Z", factor: 1.1 },
  ]);

  assert.equal(index, 990);
});

test("portfolio index keeps compounding through season boundaries", () => {
  const index = calculateRebalancedPortfolioIndex([
    { leagueType: "S", startsAt: "2026-12-01T00:00:00.000Z", factor: 1.05 },
    { leagueType: "S", startsAt: "2027-01-01T00:00:00.000Z", factor: 1.1 },
    { leagueType: "L", startsAt: "2026-07-01T00:00:00.000Z", factor: 1.2 },
    { leagueType: "L", startsAt: "2027-01-01T00:00:00.000Z", factor: 0.95 },
  ]);

  assert.equal(index, 1147.5);
});
