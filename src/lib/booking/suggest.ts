// Booking-time table arrangement suggestion engine.
//
// Admin policy gates (set per table in /admin/restaurants/[id]):
//   - is_mergeable        : eligible to be part of a merge
//   - can_lend_seats      : may lend seats
//   - max_lendable_seats  : cap on how many seats it may lend
//   - adjacent_table_ids  : which other tables are physically adjacent
//
// Hard rules enforced everywhere:
//   - Every table keeps at least 2 effective seats (lender post-lending)
//   - Merges only between mergeable tables, every pair must be adjacent

export type Table = {
  id: string;
  label: string;
  seats: number;
  is_mergeable: boolean;
  can_lend_seats: boolean;
  max_lendable_seats: number;
  adjacent_table_ids: string[];
};

export type Merge = { table_ids: string[] };
export type Borrow = { from_table_id: string; to_table_id: string };
export type ActiveBooking = { table_id: string | null };

export type SuggestionInput = {
  tables: Table[];
  existingMerges: Merge[];
  existingBorrows: Borrow[];
  existingBookings: ActiveBooking[];
  partySize: number;
  mergeFee: number;
  borrowSeatFee: number;
};

export type MergeSuggestion = {
  kind: "merge";
  tableIds: string[];
  labels: string[];
  totalSeats: number;
  fee: number;
};

export type BorrowSuggestion = {
  kind: "borrow";
  toTableId: string;
  toLabel: string;
  fromTableId: string;
  fromLabel: string;
  seats: number;
  fee: number;
};

export type Suggestion = MergeSuggestion | BorrowSuggestion;

export type SuggestionResult =
  | { status: "single_table_ok" }
  | { status: "options"; suggestions: Suggestion[] }
  | { status: "no_arrangement_possible" };

const MIN_SEATS_REMAINING = 2;

function allPairsAdjacent(ids: string[], adjacency: Map<string, Set<string>>) {
  for (let i = 0; i < ids.length; i++) {
    const adj = adjacency.get(ids[i]) ?? new Set();
    for (let j = 0; j < ids.length; j++) {
      if (i === j) continue;
      if (!adj.has(ids[j])) return false;
    }
  }
  return true;
}

export function suggest(input: SuggestionInput): SuggestionResult {
  const {
    tables,
    existingMerges,
    existingBorrows,
    existingBookings,
    partySize,
    mergeFee,
    borrowSeatFee,
  } = input;

  // A table is "committed" for this slot if it's referenced by any active
  // booking, merge, or borrow. The booking flow now claims one physical
  // table per booking, so the same table can't host two parties at once.
  const occupied = new Set<string>();
  for (const m of existingMerges) for (const id of m.table_ids) occupied.add(id);
  for (const b of existingBorrows) {
    occupied.add(b.from_table_id);
    occupied.add(b.to_table_id);
  }
  for (const b of existingBookings) {
    if (b.table_id) occupied.add(b.table_id);
  }
  const free = tables.filter((t) => !occupied.has(t.id));

  // A single free table that fits — no arrangement needed.
  if (free.some((t) => t.seats >= partySize)) {
    return { status: "single_table_ok" };
  }

  const adjacency = new Map<string, Set<string>>();
  for (const t of tables) {
    adjacency.set(t.id, new Set(t.adjacent_table_ids));
  }

  const suggestions: Suggestion[] = [];

  // ---- Merge candidates: combinations of 2 or 3 mergeable, mutually adjacent
  // free tables whose combined seats cover the party. Sort by tightest fit.
  const mergeable = free.filter((t) => t.is_mergeable);
  const mergeCandidates: MergeSuggestion[] = [];
  const pushMerge = (ids: Table[]) => {
    if (!allPairsAdjacent(ids.map((t) => t.id), adjacency)) return;
    const total = ids.reduce((s, t) => s + t.seats, 0);
    if (total < partySize) return;
    mergeCandidates.push({
      kind: "merge",
      tableIds: ids.map((t) => t.id),
      labels: ids.map((t) => t.label).sort(),
      totalSeats: total,
      fee: mergeFee,
    });
  };
  for (let i = 0; i < mergeable.length; i++) {
    for (let j = i + 1; j < mergeable.length; j++) {
      pushMerge([mergeable[i], mergeable[j]]);
      for (let k = j + 1; k < mergeable.length; k++) {
        pushMerge([mergeable[i], mergeable[j], mergeable[k]]);
      }
    }
  }
  mergeCandidates.sort(
    (a, b) =>
      a.totalSeats - partySize - (b.totalSeats - partySize) ||
      a.tableIds.length - b.tableIds.length,
  );
  suggestions.push(...mergeCandidates.slice(0, 3));

  // ---- Borrow candidates: find a target close to the party size, find a
  // donor that's allowed to lend, can spare the needed seats within its cap,
  // and keeps at least MIN_SEATS_REMAINING seats after lending.
  const borrowCandidates: BorrowSuggestion[] = [];
  for (const target of free) {
    if (target.seats >= partySize) continue;
    const need = partySize - target.seats;
    for (const donor of free) {
      if (donor.id === target.id) continue;
      if (!donor.can_lend_seats) continue;
      if (need > donor.max_lendable_seats) continue;
      if (donor.seats - need < MIN_SEATS_REMAINING) continue;
      borrowCandidates.push({
        kind: "borrow",
        toTableId: target.id,
        toLabel: target.label,
        fromTableId: donor.id,
        fromLabel: donor.label,
        seats: need,
        fee: need * borrowSeatFee,
      });
    }
  }
  borrowCandidates.sort(
    (a, b) => a.seats - b.seats || a.fee - b.fee,
  );
  const seenTarget = new Set<string>();
  for (const b of borrowCandidates) {
    if (seenTarget.has(b.toTableId)) continue;
    seenTarget.add(b.toTableId);
    suggestions.push(b);
    if (suggestions.length >= 6) break;
  }

  if (suggestions.length === 0) {
    return { status: "no_arrangement_possible" };
  }
  return { status: "options", suggestions };
}
