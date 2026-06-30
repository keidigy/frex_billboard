import type { Currency, LeagueType } from "@/lib/types";

export function formatMoney(value: number | null | undefined, currency: Currency) {
  if (value == null || Number.isNaN(value)) return "-";
  return new Intl.NumberFormat(currency === "KRW" ? "ko-KR" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "KRW" ? 0 : 2,
  }).format(value);
}

export function formatPct(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "-";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function leagueTypeLabel(type: LeagueType) {
  if (type === "S") return "단기";
  if (type === "M") return "중기";
  return "장기";
}

export function byteLength(value: string) {
  return new TextEncoder().encode(value).length;
}
