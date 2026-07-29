export type EntryBasisState = {
  early_confirmed: number;
  early_confirm_price: number | null;
  end_price: number | null;
  ranking_price: number | null;
  current_price: number | null;
  start_price: number;
  ended_at: string | null;
};

export function entryBasisPrice(entry: EntryBasisState) {
  if (entry.ended_at || entry.end_price != null) {
    return entry.ranking_price ?? entry.end_price ?? entry.current_price ?? entry.start_price;
  }
  if (entry.early_confirmed) {
    return entry.ranking_price ?? entry.early_confirm_price ?? entry.current_price ?? entry.start_price;
  }
  return entry.current_price ?? entry.start_price;
}
