import type { PricePoint } from "@/lib/types";

type SnapshotDate = {
  date: string;
};

export type DailyPriceEntryState = {
  league_starts_at: string;
  league_ends_at: string;
  ended_at: string | null;
  early_confirmed: number;
  manual_price_required: number;
  disqualified: number;
  start_price_finalized_at: string | null;
};

const KST_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function kstDateKey(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return KST_DATE_FORMATTER.format(date);
}

export function captureWindowStart(leagueStartsAt: string, lastPriceAt: string | null, overlapDays = 2) {
  const leagueStart = new Date(leagueStartsAt);
  const lastPrice = lastPriceAt ? new Date(lastPriceAt) : null;
  const base =
    lastPrice && Number.isFinite(lastPrice.getTime()) && lastPrice.getTime() > leagueStart.getTime()
      ? new Date(lastPrice)
      : new Date(leagueStart);

  base.setUTCDate(base.getUTCDate() - overlapDays);
  if (base.getTime() < leagueStart.getTime()) return leagueStart.toISOString();
  return base.toISOString();
}

export function shouldFinalizeStartingPrice(
  entry: Pick<DailyPriceEntryState, "league_starts_at" | "league_ends_at" | "ended_at" | "disqualified" | "start_price_finalized_at">,
  now: string
) {
  return (
    entry.start_price_finalized_at == null &&
    entry.ended_at == null &&
    entry.disqualified === 0 &&
    entry.league_starts_at <= now &&
    now < entry.league_ends_at
  );
}

export function shouldCaptureDailyPrice(entry: DailyPriceEntryState, now: string) {
  return (
    entry.start_price_finalized_at != null &&
    entry.ended_at == null &&
    entry.disqualified === 0 &&
    entry.early_confirmed === 0 &&
    entry.manual_price_required === 0 &&
    entry.league_starts_at <= now &&
    now < entry.league_ends_at
  );
}

export function selectMissingTradingCloses(
  points: PricePoint[],
  existingSnapshots: SnapshotDate[],
  fromInclusive: string,
  toInclusive: string
) {
  const from = new Date(fromInclusive).getTime();
  const to = new Date(toInclusive).getTime();
  const seenKeys = new Set(existingSnapshots.map((snapshot) => kstDateKey(snapshot.date)).filter(Boolean));

  return points
    .filter((point) => Number.isFinite(point.close))
    .filter((point) => {
      const time = new Date(point.date).getTime();
      return Number.isFinite(time) && time >= from && time <= to;
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .filter((point) => {
      const key = kstDateKey(point.date);
      if (!key || seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    });
}
